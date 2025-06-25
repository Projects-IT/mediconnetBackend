const exp = require("express");
const adminApp = exp.Router();
const expressAsyncHandler = require("express-async-handler");
const bcryptjs = require("bcryptjs");
const jsonWebToken = require("jsonwebtoken");
adminApp.use(exp.json());
const nodemailer = require("nodemailer");
const axios = require('axios');

let adminCollObj;
let doctorCollecObj;


adminApp.use((req,res,next)=>{
    adminCollObj=req.app.get('adminCollection')
    doctorCollecObj = req.app.get("doctorCollection");

    next()
})

// post admin registration
adminApp.post(
    "/admin",
    expressAsyncHandler(async (req, res, next) => {
      let admin = req.body;
      console.log(admin);
      let dbadmin = await adminCollObj.findOne(
        {$or:[{$and:[{FirstName:admin.FirstName},{LastName:admin.LastName}]},{email:admin.email}]}
      );
      if (dbadmin!== null) {
        res.send({ message: "admin exits" });
      } else {
        let pass = admin.password;
        let hashpass = await bcryptjs.hash(pass, 5);
        admin.password = hashpass;
        await adminCollObj.insertOne(admin);
        res.send({message: "new Admin register", admin: admin });
      }
    })
  );


// post admin login
  adminApp.post(
    "/login",
    expressAsyncHandler(async (req, res) => {
      const admin = req.body;
      let dbadmin = await adminCollObj.findOne({ email: admin.email });
      if (dbadmin === null) {
        res.send({ message: "Invaild email" });
      } else {
        let pass = await bcryptjs.compare(admin.password, dbadmin.password);
        if (pass) {
          const token = jsonWebToken.sign(
            { username: admin.username },
            process.env.SECRET_KEY,
            { expiresIn: "1d" }
          );
          res.send({ message: "Login success", token: token, admin:dbadmin });
        } else {
          res.send({ message: "Invaild password" });
        }
      }
    })
  );


const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // Use `true` for port 465, `false` for all other ports
    auth: {
      user: "abhilashbanda7@gmail.com",
      pass: "dbsw azmz uzhk vdzw",
      // pass:"bgzf idcs uoge wnru"
    },
  });
  // post doctor password
  adminApp.post('/doctor',expressAsyncHandler(async (req,res)=>{
    doctor=req.body
    let pass=doctor.password
    let hashpass = await bcryptjs.hash(pass, 5);
  let mod = await doctorCollecObj.findOneAndUpdate({email: doctor.email},{$set:{status:"Accepted",password:hashpass}},{returnDocument:'after'})
  
  // -- START: Auto-create chat with new doctor --
  try {
    const adminUser = await req.app.get("adminCollection").findOne(); // Get the first admin
    if (adminUser && mod) {
      const newDoctor = mod;
      
      const chatData = {
        participants: [
          { userId: adminUser._id.toString(), userType: 'admin' },
          { userId: newDoctor._id.toString(), userType: 'doctor' }
        ],
        chatType: 'admin-doctor', // Corrected chat type
        createdAt: new Date(),
        lastMessageTimestamp: new Date()
      };
      
      const chatsCollection = req.app.get("chatsCollection");
      const chatMessagesCollection = req.app.get("chatMessagesCollection");

      // Create the chat
      const chatResult = await chatsCollection.insertOne(chatData);
      
      // Send a welcome message
      if (chatResult.insertedId) {
        const welcomeMessageText = `Welcome to the team, Dr. ${newDoctor.LastName}! We're excited to have you on board. Your account is now active.`;
        const welcomeMessage = {
          chatId: chatResult.insertedId.toString(),
          senderId: adminUser._id.toString(),
          senderType: 'admin',
          message: welcomeMessageText,
          messageType: 'text',
          isRead: false,
          timestamp: new Date()
        };
        await chatMessagesCollection.insertOne(welcomeMessage);

        // Also update the last message on the chat itself
        await chatsCollection.updateOne(
            { _id: chatResult.insertedId },
            { $set: { lastMessage: welcomeMessageText, lastMessageTimestamp: welcomeMessage.timestamp } }
        );
      }
    }
  } catch(err) {
    console.error("Error creating chat with new doctor:", err);
    // Do not block the main response for this error
  }
  // -- END: Auto-create chat with new doctor --

  const mailoptions = {
    from: "MediConnect abhilashbanda7@gmail.com",
    to: doctor.email,
    subject: `Registration Confirmation and Account Details`,
    text: `Dear Dr. ${doctor.FirstName} ${doctor.LastName},

Welcome to MEDICONNECT! Your registration is complete.

Account Details:

Username: ${doctor.email}
Password: ${pass}
Please log in at MediConnect.com and change your password promptly.

For assistance, contact us at mediconnect711@gmail.com or 7396939296.

We are excited to have you on our team!

Best regards,

Team MEDICONNECT` 
  };
  transporter.sendMail(mailoptions,function(error,info){
    if(error){
        console.log("error has been occurred",error);
    }else{
        console.log("sent successfully");
    }
});

    res.send({ message: "docter register successfull", data: mod });
    console.log(mod.password);

  }))

  // post doctor rejected
  adminApp.post('/doctorReject',expressAsyncHandler(async (req,res)=>{
    doctor=req.body
    console.log(doctor);

  let mod = await doctorCollecObj.deleteOne({email:doctor.email})
  const mailoptions = {
    from: "MediConnect abhilashbanda7@gmail.com",
    to: doctor.email,
    subject: `Request Rejection Notice - Incorrect Files Submitted`,
    text: `Dear Dr. ${doctor.FirstName} ${doctor.LastName},
We regret to inform you that your recent request to [enter/perform specific action] on Mediconnect has been rejected due to the submission of incorrect or incomplete files.

To proceed, please review and resubmit the required documents ensuring they meet the specified criteria. Here are the details:

Submitted Files: ${doctor.docs}
Issue(s): [Reason for Rejection - e.g., incorrect format, missing information]

File Requirements:

File Format:

Documents must be submitted in PDF format.
Images must be in JPEG or PNG format.
Content Requirements:

All documents must be clearly legible.
Personal identification documents must include a clear photo and all relevant details.
Medical licenses must be current and valid.
Additional Information:

Ensure that all forms are fully completed and signed where necessary.
Include any additional certifications or qualifications relevant to your request.
We understand that this may cause inconvenience, and we are here to assist you in ensuring your resubmission is successful. Should you have any questions or need further clarification, please do not hesitate to contact our support team at [support email/phone number].

Thank you for your understanding and cooperation.

Best regards,
The Mediconnect Team` 
  };
  transporter.sendMail(mailoptions,function(error,info){
    if(error){
        console.log("error has been occurred",error);
    }else{
        console.log("sent successfully");
    }
});

    res.send({ message: "docter register successfull", data: mod });
  }))

module.exports=adminApp