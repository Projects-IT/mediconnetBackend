const exp = require("express");
const doctorApp = exp.Router();
const expressAsyncHandler = require("express-async-handler");
const bcryptjs = require("bcryptjs");
const jsonWebToken = require("jsonwebtoken");
const nodemailer = require("nodemailer");

const ObjectId =require('mongodb').ObjectId


doctorApp.use(exp.json());
doctorApp.use('/uploads',exp.static('uploads'))


//file
const fs = require("fs");
//upload
const upload = require("../middlewares/multer");

//upload to cloud
const cloudinary = require("../cloud/cloudinary");

//doctor collection
let doctorCollecObj;
let deletedDoctorCollecObj;
let adminCollecObj;

doctorApp.use((req, res, next) => {
  doctorCollecObj = req.app.get("doctorCollection");
  deletedDoctorCollecObj = req.app.get("deletedDoctorCollection");
  adminCollecObj = req.app.get("adminCollection");
  next();
});

// Email transport configuration
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: "abhilashbanda7@gmail.com",
    pass: "dbsw azmz uzhk vdzw",
  },
});

//multiple files
const cpUpload = upload.fields([
  { name: "avthar" },
  { name: "doctorDoc", maxCount: 8 },
]);

// upload.single('myfile')

//password generate
function generatePass() {
  let pass = '';
  let str = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
      'abcdefghijklmnopqrstuvwxyz0123456789@#$';

  for (let i = 1; i <= 8; i++) {
      let char = Math.floor(Math.random()
          * str.length + 1);

      pass += str.charAt(char)
  }
  console.log(pass);

  return pass;
}

// Check if doctor exists in deleted collection
doctorApp.post("/check-deleted", expressAsyncHandler(async (req, res) => {
  const doctorData = req.body;
  console.log("Checking for deleted doctor:", doctorData);
  
  try {
    const deletedDoctor = await deletedDoctorCollecObj.findOne({
      $or: [
        { email: doctorData.email },
        { $and: [{ FirstName: doctorData.FirstName }, { LastName: doctorData.LastName }] }
      ]
    });
    
    if (deletedDoctor) {
      res.send({ 
        message: "Doctor found in deleted collection",
        isDeleted: true,
        doctor: deletedDoctor
      });
    } else {
      res.send({ 
        message: "Doctor not found in deleted collection",
        isDeleted: false
      });
    }
  } catch (error) {
    console.error("Error checking deleted doctor:", error);
    res.status(500).send({ message: "Error checking deleted doctor", error: error.message });
  }
}));

// Get a specific doctor by ID
doctorApp.get("/doctor/:id", expressAsyncHandler(async (req, res) => {
  const doctorId = req.params.id;
  console.log("Fetching doctor with ID:", doctorId);
  
  try {
    const doctor = await doctorCollecObj.findOne({ _id: new ObjectId(doctorId) });
    
    if (!doctor) {
      return res.status(404).send({ message: "Doctor not found" });
    }
    
    res.send({ 
      message: "Doctor fetched successfully",
      doctor: doctor
    });
  } catch (error) {
    console.error("Error fetching doctor:", error);
    res.status(500).send({ message: "Error fetching doctor", error: error.message });
  }
}));

// Remove doctor (soft delete)
doctorApp.post("/remove/:id", expressAsyncHandler(async (req, res) => {
  const doctorId = req.params.id;
  const { reason } = req.body;
  
  try {
    // Find the doctor
    const doctor = await doctorCollecObj.findOne({ _id: new ObjectId(doctorId) });
    
    if (!doctor) {
      return res.status(404).send({ message: "Doctor not found" });
    }
    
    // Add removal information
    doctor.removalDate = new Date();
    doctor.removalReason = reason || "No reason provided";
    
    // Move to deleted collection
    await deletedDoctorCollecObj.insertOne(doctor);
    
    // Remove from active collection
    await doctorCollecObj.deleteOne({ _id: new ObjectId(doctorId) });
    
    // Send email to doctor
    const mailOptions = {
      from: "MediConnect abhilashbanda7@gmail.com",
      to: doctor.email,
      subject: "MediConnect - Your Account Has Been Removed",
      text: `Dear Dr. ${doctor.FirstName} ${doctor.LastName},

We regret to inform you that your account at MediConnect has been removed.

${reason ? `Reason: ${reason}` : ""}

If you believe this was done in error or wish to reapply, please contact our administration or register again through our portal.

Best regards,
MediConnect Administration Team`
    };
    
    transporter.sendMail(mailOptions, function(error, info) {
      if (error) {
        console.log("Error sending email:", error);
      } else {
        console.log("Email sent successfully");
      }
    });
    
    res.send({ message: "Doctor removed successfully" });
    
  } catch (error) {
    console.error("Error removing doctor:", error);
    res.status(500).send({ message: "Error removing doctor", error: error.message });
  }
}));

// Restore a deleted doctor
doctorApp.post("/restore/:id", expressAsyncHandler(async (req, res) => {
  const doctorId = req.params.id;
  const { startFresh } = req.body;
  
  try {
    // Find the doctor in deleted collection
    const deletedDoctor = await deletedDoctorCollecObj.findOne({ _id: new ObjectId(doctorId) });
    
    if (!deletedDoctor) {
      return res.status(404).send({ message: "Deleted doctor not found" });
    }
    
    if (startFresh) {
      // Keep record but allow re-registration
      res.send({ message: "Doctor can register as new" });
    } else {
      // Remove restoration fields
      delete deletedDoctor.removalDate;
      delete deletedDoctor.removalReason;
      
      // Check for any other deleted doctors with the same email or name
      const otherDeletedDoctors = await deletedDoctorCollecObj.find({
        _id: { $ne: new ObjectId(doctorId) },
        $or: [
          { email: deletedDoctor.email },
          { $and: [{ FirstName: deletedDoctor.FirstName }, { LastName: deletedDoctor.LastName }] }
        ]
      }).toArray();
      
      console.log(`Found ${otherDeletedDoctors.length} additional deleted records for this doctor`);
      
      // Combine relevant information from other deleted records if they exist
      if (otherDeletedDoctors.length > 0) {
        // Combine appointments from all records (to be implemented)
        // Keep the most recent documents and certifications
        
        // Create a merged history of all records
        const mergedHistory = otherDeletedDoctors.map(doc => ({
          recordId: doc._id.toString(),
          removalDate: doc.removalDate,
          removalReason: doc.removalReason
        }));
        
        // Add current record history
        if (!deletedDoctor.previousRecords) {
          deletedDoctor.previousRecords = [];
        }
        
        deletedDoctor.previousRecords = [
          ...deletedDoctor.previousRecords,
          ...mergedHistory
        ];
        
        // Delete other records
        for (const doc of otherDeletedDoctors) {
          await deletedDoctorCollecObj.deleteOne({ _id: doc._id });
        }
      }
      
      // Move back to active collection
      await doctorCollecObj.insertOne(deletedDoctor);
      
      // Remove from deleted collection
      await deletedDoctorCollecObj.deleteOne({ _id: new ObjectId(doctorId) });
      
      // Send email to doctor
      const mailOptions = {
        from: "MediConnect abhilashbanda7@gmail.com",
        to: deletedDoctor.email,
        subject: "MediConnect - Your Account Has Been Restored",
        text: `Dear Dr. ${deletedDoctor.FirstName} ${deletedDoctor.LastName},

We are pleased to inform you that your account at MediConnect has been restored.

You can now log in with your previous credentials.

Best regards,
MediConnect Administration Team`
      };
      
      transporter.sendMail(mailOptions, function(error, info) {
        if (error) {
          console.log("Error sending email:", error);
        } else {
          console.log("Email sent successfully");
        }
      });
      
      res.send({ 
        message: "Doctor restored successfully",
        doctor: deletedDoctor
      });
    }
  } catch (error) {
    console.error("Error restoring doctor:", error);
    res.status(500).send({ message: "Error restoring doctor", error: error.message });
  }
}));

// Notify all admins about doctor registration (new or returning)
async function notifyAdmins(subject, message) {
  try {
    const admins = await adminCollecObj.find({}).toArray();
    const adminEmails = admins.map(admin => admin.email);
    
    if (adminEmails.length === 0) {
      console.log("No admin emails found");
      return;
    }
    
    const mailOptions = {
      from: "MediConnect abhilashbanda7@gmail.com",
      to: adminEmails.join(", "),
      subject: subject,
      text: message
    };
    
    transporter.sendMail(mailOptions, function(error, info) {
      if (error) {
        console.log("Error sending email to admins:", error);
      } else {
        console.log("Email sent to admins successfully");
      }
    });
  } catch (error) {
    console.error("Error notifying admins:", error);
  }
}

// post doctor registrartion
doctorApp.post("/doctor", cpUpload, expressAsyncHandler(async function (req, res, next) {
    docData = req.body;
    // console.log("doc reg",docData);
    // console.log("doc reg",req.files);
    //   console.log("file uploaded");
    //   console.log(
    //     "avthar",
    //     req.files.avthar[0].path,
    //     "pdf",
    //     req.files.doctorDoc[0].path
    //   );
    let dbDocData=await doctorCollecObj.findOne({$or:[{$and:[{ FirstName:docData. FirstName},{ LastName:docData. LastName}]},{email:docData.email}]})
    if(dbDocData!==null){
        res.send({message:"doctor exist"})
        fs.unlink(req.files.avthar[0].path, function (err) {
            if (err) console.log(err);
            else {
                console.log(`\nDeleted file: ${req.files.avthar[0].path}`);

            // Get the files in current directory
            // after deletion
            }
        });
        fs.unlink(req.files.doctorDoc[0].path, function (err) {
            if (err) console.log(err);
            else {
            console.log(`\nDeleted file: ${req.files.doctorDoc[0].path}`);
        
            // Get the files in current directory
            // after deletion
            }
        });
    }
    else{
      // Check if doctor was previously deleted
      let deletedDoctor = await deletedDoctorCollecObj.findOne({
        $or: [
          { email: docData.email },
          { $and: [{ FirstName: docData.FirstName }, { LastName: docData.LastName }] }
        ]
      });
      
      if (deletedDoctor && docData.isReturning) {
        // If this is a returning doctor and they want to use their previous data
        if (docData.usePreviousData === 'true') {
          // Restore their previous data but update with new files
          av = await cloudinary(req.files.avthar[0].path);
          deletedDoctor.avthar = av.secure_url;
          deletedDoctor.docs = req.files.doctorDoc[0].filename;
          
          // Remove deletion info
          delete deletedDoctor.removalDate;
          delete deletedDoctor.removalReason;
          
          // Always set status to Pending for admin approval
          deletedDoctor.status = "Pending";
          
          // Mark as returning doctor
          deletedDoctor.isReturningDoctor = true;
          
          // Generate new password regardless of previous status
          pass = generatePass();
          deletedDoctor.password = pass;
          
          // Add any explanation from the doctor
          deletedDoctor.returnMessage = docData.returnMessage || '';
          
          // Save to active collection
          await doctorCollecObj.insertOne(deletedDoctor);
          
          // Remove from deleted collection
          await deletedDoctorCollecObj.deleteOne({ _id: deletedDoctor._id });
          
          // Notify admins
          notifyAdmins(
            "Previously Registered Doctor Attempting Re-registration",
            `A previously registered doctor is returning to MediConnect:
            
Name: Dr. ${deletedDoctor.FirstName} ${deletedDoctor.LastName}
Email: ${deletedDoctor.email}
Department: ${deletedDoctor.department}
Message: ${deletedDoctor.returnMessage || 'No message provided'}

This doctor has chosen to restore their previous data.
Please review their application in the admin dashboard.`
          );
          
          res.send({ message: "Returning doctor register successful", data: deletedDoctor });
        } else {
          // They want to start fresh, proceed as new doctor
          av = await cloudinary(req.files.avthar[0].path);
          docData.avthar = av.secure_url;
          docData.docs = req.files.doctorDoc[0].filename;
          
          // Mark as returning doctor who chose to start fresh
          docData.isReturningDoctor = true;
          docData.startedFresh = true;
          
          // Always set status to Pending
          docData.status = "Pending";
          pass = generatePass();
          docData.password = pass;
          
          await doctorCollecObj.insertOne(docData);
          
          // Notify admins
          notifyAdmins(
            "Previously Registered Doctor Starting Fresh",
            `A previously registered doctor is starting fresh on MediConnect:
            
Name: Dr. ${docData.FirstName} ${docData.LastName}
Email: ${docData.email}
Department: ${docData.department}
Message: ${docData.returnMessage || 'No message provided'}

This doctor has chosen to start fresh rather than restore previous data.
Please review their application in the admin dashboard.`
          );
          
          res.send({ message: "doctor register successful", data: docData });
        }
      } else {
        // New doctor registration
    av = await cloudinary(req.files.avthar[0].path);
    docData.avthar = av.secure_url;
    docData.docs = req.files.doctorDoc[0].filename;
        
        if (docData.status === "Pending") {
          pass = generatePass();
          docData.password = pass;
      await doctorCollecObj.insertOne(docData);
          
          // Notify admins about new doctor
          notifyAdmins(
            "New Doctor Registration",
            `A new doctor has registered on MediConnect:
            
Name: Dr. ${docData.FirstName} ${docData.LastName}
Email: ${docData.email}
Department: ${docData.department}

Please review their application in the admin dashboard.`
          );
          
          res.send({ message: "doctor register successful", data: docData });
    }
        
        if (docData.status === "Accepted") {
          pass = docData.password;
      let hashpass = await bcryptjs.hash(pass, 5);
          docData.password = hashpass;
      await doctorCollecObj.insertOne(docData);
          res.send({ message: "doctor register successful", data: docData });
        }
    }

      // Clean up uploaded files
    fs.unlink(req.files.avthar[0].path, function (err) {
        if (err) console.log(err);
        else {
        console.log("\nDeleted file: example_file.txt");
        }
    });
    }
    }));

// post doctor login
doctorApp.post(
      "/login",
      expressAsyncHandler(async (req, res) => {
        const doctor = req.body;
        let dbdoctor = await doctorCollecObj.findOne({ email: doctor.email });
        if (dbdoctor === null) {
          res.send({ message: "Invaild email" });
        } else {
          let pass = await bcryptjs.compare(doctor.password, dbdoctor.password);
          if (pass) {
            const token = jsonWebToken.sign(
              { username: doctor.username },
              process.env.SECRET_KEY,
              { expiresIn: "1d" }
            );
            res.send({ message: "Login success", token: token, doctor:dbdoctor });
          } else {
            res.send({ message: "Invaild password" });
          }
        }
      })
    );


// doctor by department 
//#*NOT USED*#
doctorApp.get(
  "/doctors/:department",
  expressAsyncHandler(async (req, res) => {
    let department=req.params.department
    let doctors=await doctorCollecObj.find({department:department}).toArray()
    res.send({ message: "hey",doctors:doctors });
  })
);

//doctors
doctorApp.get(
  "/doctors",
  expressAsyncHandler(async (req, res) => {
    
    let doctors=await doctorCollecObj.find({status:"Accepted"}).toArray()
    res.send({ message: "doctores Fetched",doctors:doctors });
  })
);

// Update doctor rating
doctorApp.post("/update-rating/:doctorId", expressAsyncHandler(async (req, res) => {
  try {
    const doctorId = req.params.doctorId;
    const { rating } = req.body;
    
    // Validate doctorId
    if (!doctorId || !ObjectId.isValid(doctorId)) {
      return res.status(400).send({ 
        message: "Invalid doctor ID",
        details: "The provided doctor ID is not valid"
      });
    }
    
    if (!rating) {
      return res.status(400).send({ message: "Rating is required" });
    }
    
    // Get current doctor info
    const doctor = await doctorCollecObj.findOne({ _id: new ObjectId(doctorId) });
    
    if (!doctor) {
      return res.status(404).send({ message: "Doctor not found" });
    }
    
    // Calculate new average rating
    let currentRating = parseFloat(doctor.rating || 0);
    let totalReviews = parseInt(doctor.totalReviews || 0);
    
    // If this is the first review, just set it
    if (totalReviews === 0) {
      currentRating = parseFloat(rating);
      totalReviews = 1;
    } else {
      // Otherwise calculate the new average
      // We need to calculate what the sum was, add the new rating, and divide by the new count
      const currentSum = currentRating * totalReviews;
      const newSum = currentSum + parseFloat(rating);
      totalReviews += 1;
      currentRating = newSum / totalReviews;
    }
    
    // Update doctor with new rating
    await doctorCollecObj.updateOne(
      { _id: new ObjectId(doctorId) },
      { 
        $set: { 
          rating: currentRating.toFixed(1),
          totalReviews: totalReviews
        } 
      }
    );
    
    res.status(200).send({ 
      message: "Doctor rating updated successfully",
      newRating: currentRating.toFixed(1),
      totalReviews
    });
  } catch (error) {
    console.error("Error updating doctor rating:", error);
    res.status(500).send({ 
      message: "Error updating doctor rating", 
      error: error.message 
    });
  }
}));

//doctors request
doctorApp.get(
  "/doctorsRequest",
  expressAsyncHandler(async (req, res) => {
    let doctors=await doctorCollecObj.find({status:"Pending"}).toArray()
    res.send({ message: "doctores Fetched",doctors:doctors });
  })
);

//password Change

doctorApp.put('/change/:id',expressAsyncHandler( async (req,res)=>{
  let pass=req.body.password
  let id=req.params.id
  // console.log(pass,id);
  let hashpass = await bcryptjs.hash(pass, 5);
  let mod = await doctorCollecObj.findOneAndUpdate({_id:new ObjectId(id)},{$set:{password:hashpass}},{returnDocument:'after'})
  // console.log(mod)
  res.send({message:"password changed successfully",doctor:mod})
}
))

module.exports = doctorApp;
