const exp = require("express");
const patientApp = exp.Router();
const expressAsyncHandler = require("express-async-handler");
const bcryptjs = require("bcryptjs");
const jsonWebToken = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const { ObjectId } = require('mongodb');
const axios = require("axios"); // Add axios for internal API calls
patientApp.use(exp.json());
//
let patientCollecObj;
let appointmentCollecObj;
//doctor collection
let doctorCollecObj;
let messageCollecObj;
patientApp.use((req, res, next) => {
  patientCollecObj = req.app.get("patientCollection");
  appointmentCollecObj = req.app.get("appointmentCollection");
  doctorCollecObj = req.app.get("doctorCollection");
  messageCollecObj = req.app.get("messageCollection");
  // Add chat collections
  req.chatsCollection = req.app.get("chatsCollection");
  req.chatMessagesCollection = req.app.get("chatMessagesCollection");
  req.adminCollection = req.app.get("adminCollection");
  next();
});

patientApp.get(
  "/patients",
  expressAsyncHandler((req, res) => {
    res.send({ message: "working" });
  })
);

//Post details of Patient Register component
patientApp.post(
  "/patient",
  expressAsyncHandler(async (req, res, next) => {
    let patient = req.body;
    console.log(patient);
    let dbpatient = await patientCollecObj.findOne(
      {$or:[{$and:[{FirstName:patient.FirstName},{LastName:patient.LastName}]},{email:patient.email}]}
    );
    if (dbpatient!== null) {
      res.send({ message: "patient exits" });
    } else {
      let pass = patient.password;
      let hashpass = await bcryptjs.hash(pass, 5);
      patient.password = hashpass;
      const result = await patientCollecObj.insertOne(patient);
      const patientId = result.insertedId.toString();

      // --- Direct Admin-Patient Chat Creation ---
      try {
        const adminUser = await req.adminCollection.findOne();
        if (adminUser) {
          const adminId = adminUser._id.toString();
          const existingChat = await req.chatsCollection.findOne({
            chatType: 'patient-admin',
            'participants.userId': { $all: [patientId, adminId] }
          });

          if (!existingChat) {
            const chatResult = await req.chatsCollection.insertOne({
              participants: [{ userId: patientId, userType: 'patient' }, { userId: adminId, userType: 'admin' }],
              chatType: 'patient-admin',
              createdAt: new Date(),
              lastMessageTimestamp: new Date(),
            });

            const welcomeMessage = "Welcome to MediConnect! How can we help you today?";
            await req.chatMessagesCollection.insertOne({
              chatId: chatResult.insertedId.toString(),
              senderId: adminId,
              senderType: 'admin',
              message: welcomeMessage,
              messageType: 'text',
              isRead: false,
              timestamp: new Date()
            });

            await req.chatsCollection.updateOne(
              { _id: chatResult.insertedId },
              { $set: { lastMessage: welcomeMessage } }
            );
          }
        }
      } catch (err) {
        console.error("Error creating chat with admin on registration:", err);
      }
      // --- End of Chat Creation ---
      
      res.send({message: "new patient register", patient: patient });
    }
  })
);

//Post login component
patientApp.post(
  "/login",
  expressAsyncHandler(async (req, res) => {
    const patient = req.body;
    let dbpatient = await patientCollecObj.findOne({ email: patient.email });
    if (dbpatient == null) {
      res.send({ message: "Invaild email" });
    } else {
      let pass = await bcryptjs.compare(patient.password, dbpatient.password);
      if (pass) {
        const token = jsonWebToken.sign(
          { username: patient.username },
          process.env.SECRET_KEY,
          { expiresIn: "1d" }
        );
        res.send({ message: "Login success", token: token, patient:dbpatient });
      } else {
        res.send({ message: "Invaild password" });
      }
    }
  })
);

//traspoart message to patient
const transporter1 = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false, // Use `true` for port 465, `false` for all other ports
  auth: {
    user: "abhilashbanda7@gmail.com",
    pass: "dbsw azmz uzhk vdzw",
  },
});

//traspoart message to doc
const transporter2 = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false, // Use `true` for port 465, `false` for all other ports
  auth: {
    user: "abhilashbanda7@gmail.com",
    pass: "dbsw azmz uzhk vdzw",
  }
},
// {from: 'Mediconnect'}
);

//Post appointment details
patientApp.post(
  "/appointment",
  expressAsyncHandler(async (req, res) => {
    let appointment = req.body;
    
    docFull=appointment.doctor.split(" ");
    docFirstName=docFull[0]
    docLastName=docFull[1]
    docLastNameCh=docFull[docFull.length-1]
    if (docLastNameCh!==docLastName) {
      docFirstName=docFirstName+" "+docLastName;
      docLastName=docLastNameCh
    }
    console.log(docFirstName,docLastName,docLastNameCh);
    console.log(appointment);
    let dbDocData=await doctorCollecObj.findOne({$and:[{ FirstName:docFirstName},{ LastName:docLastName}]})
    
    if (!dbDocData) {
        return res.status(404).send({ message: "Doctor not found" });
    }

    // Add doctorId to the appointment data
    appointment.doctorId = dbDocData._id.toString();
    
    console.log(appointment.email);
    
    const mailoptions = {
        from: "MediConnect abhilashbanda7@gmail.com",
        to: appointment.email,
        subject: `Confirm your appointment Reminder: Upcoming appointment with Dr. ${appointment.doctor}`,
        text: `Dear ${appointment.FirstName} ${appointment.LastName},
  This is a friendly reminder of your next appointment with Dr. ${appointment.doctor} on  ${appointment.dateOfAppointment} at ${appointment.address} in our clinic. Please arrive at least 10-15 minutes before your appointment to fill out any necessary forms.
  
  Please let us know at least 24 hours in advance if you need to reschedule the appointment.
  
  We look forward to seeing you soon.
  
  Best regards,
  
  Team MediConnect` 
      };
      
    // Only send email to doctor if we found their email
    if (dbDocData && dbDocData.email) {
    const mailoptions2 = {
        from: "MediConnect abhilashbanda7@gmail.com",
        to: dbDocData.email,
        subject: ` New Appointment Booking -${appointment.FirstName} ${appointment.LastName} on ${appointment.dateOfAppointment}`,
        text: `Dear Dr. ${appointment.doctor},

We are pleased to inform you that a new appointment has been scheduled through Mediconnect. Below are the details:

Patient's Name: ${appointment.FirstName} ${appointment.LastName}
Appointment Date: ${appointment.dateOfAppointment}
Appointment Time: ${appointment.timeOfAppointment}
Reason for Visit:  ${appointment.ReasonForVist}
Please log in to your Mediconnect account to view more details and confirm the appointment.

Thank you for using Mediconnect.

Best regards,
The Mediconnect Team` 
      };
        
      transporter2.sendMail(mailoptions2,function(error,info){
        if(error){
            console.log("error has been occurred while sending email");
        }else{
            console.log("sent successfully");
        }
    });
    }
    
    transporter1.sendMail(mailoptions,function(error,info){
        if(error){
            console.log("error has been occurred while sending email");
        }else{
            console.log("sent successfully");
        }
    });
    
    const result = await appointmentCollecObj.insertOne(appointment);
    const appointmentId = result.insertedId.toString();

    // --- Direct Patient-Doctor Chat Creation ---
    try {
        const patient = await patientCollecObj.findOne({ email: appointment.email });
        if (patient) {
            const patientId = patient._id.toString();
            const doctorId = dbDocData._id.toString();

            const existingChat = await req.chatsCollection.findOne({
                chatType: 'patient-doctor',
                'participants.userId': { $all: [patientId, doctorId] }
            });

            if (!existingChat) {
                const chatResult = await req.chatsCollection.insertOne({
                    participants: [{ userId: patientId, userType: 'patient' }, { userId: doctorId, userType: 'doctor' }],
                    chatType: 'patient-doctor',
                    appointmentId: new ObjectId(appointmentId),
                    createdAt: new Date(),
                    lastMessageTimestamp: new Date(),
                });

                const welcomeMessage = `Hello ${patient.FirstName}, I'm Dr. ${dbDocData.LastName}. Feel free to message me with any questions about your upcoming appointment.`;
                await req.chatMessagesCollection.insertOne({
                    chatId: chatResult.insertedId.toString(),
                    senderId: doctorId,
                    senderType: 'doctor',
                    message: welcomeMessage,
                    messageType: 'text',
                    isRead: false,
                    timestamp: new Date()
                });
                
                await req.chatsCollection.updateOne(
                    { _id: chatResult.insertedId },
                    { $set: { lastMessage: welcomeMessage } }
                );
            }
        }
    } catch (err) {
        console.error("Error creating chat for appointment:", err);
    }
    // --- End of Chat Creation ---
    
    res.send({ message: "appointment successFull" });
    
  })
);

patientApp.get('/perviousAppointment/:currentpatient',expressAsyncHandler(async (req,res)=>{
    let currentpatient=req.params.currentpatient
    console.log("hi");
    let patient=currentpatient.split(" ");
    console.log(patient);
    
    // Get appointments for this patient
    let dbAppointments = await appointmentCollecObj.find({FirstName:patient[0], LastName:patient[1]}).toArray();
    
    // For each appointment, ensure it has a doctorId
    // If not already present, look up the doctor and add the ID
    for (let i = 0; i < dbAppointments.length; i++) {
        const appointment = dbAppointments[i];
        
        // Skip if appointment already has doctorId
        if (appointment.doctorId) continue;
        
        // Extract doctor's name
        const doctorFullName = appointment.doctor;
        if (!doctorFullName) continue;
        
        const docNameParts = doctorFullName.split(" ");
        let docFirstName = docNameParts[0];
        let docLastName = docNameParts[docNameParts.length - 1];
        
        // Handle middle names in doctor's name
        if (docNameParts.length > 2) {
            docFirstName = docNameParts.slice(0, -1).join(" ");
        }
        
        // Look up the doctor
        try {
            const doctor = await doctorCollecObj.findOne({
                $and: [
                    { FirstName: { $regex: new RegExp(`^${docFirstName}$`, "i") } },
                    { LastName: { $regex: new RegExp(`^${docLastName}$`, "i") } }
                ]
            });
            
            if (doctor && doctor._id) {
                // Update the appointment in the database with the doctorId
                await appointmentCollecObj.updateOne(
                    { _id: appointment._id },
                    { $set: { doctorId: doctor._id.toString() } }
                );
                
                // Update the appointment in our result set
                dbAppointments[i].doctorId = doctor._id.toString();
            }
        } catch (err) {
            console.error("Error finding doctor for appointment:", err);
        }
    }
    
    console.log(dbAppointments);
    res.send({message:"Previous appointments", PerviousAppointments:dbAppointments})
}))
patientApp.get('/Appointment',expressAsyncHandler(async (req,res)=>{
    let dbAppointments=await appointmentCollecObj.find().toArray()
    res.send({message:"Previous appointments",Appointments:dbAppointments})
}))

patientApp.put('/update/:id',expressAsyncHandler(async (req,res)=>{
  let id=req.params.id
  let status=req.body.status
  // console.log(id,status);
  let mod = await appointmentCollecObj.findOneAndUpdate({_id: new ObjectId(id)},{$set:{status:status}},{returnDocument:'after'})
  // console.log(mod);
  res.send({message:"status updated",payload:mod})
}))


// currentDoctor appointment
patientApp.get('/Appointments/:currentDoctor',expressAsyncHandler(async (req,res)=>{
  let currentDoctor=req.params.currentDoctor
  console.log(currentDoctor);
  
  try {
    // Check if it's a doctor ID (MongoDB ObjectId format)
    if (currentDoctor.match(/^[0-9a-fA-F]{24}$/)) {
      // First try to find the doctor by ID
      const doctor = await doctorCollecObj.findOne({ _id: new ObjectId(currentDoctor) });
      
      if (doctor) {
        // If found, get appointments for this doctor's full name
        const doctorFullName = `${doctor.FirstName} ${doctor.LastName}`;
        const dbAppointments = await appointmentCollecObj.find({ doctor: doctorFullName }).toArray();
        console.log("Found appointments by doctor ID:", dbAppointments.length);
        res.send({
          message: "Current Doctor appointments",
          CurrentDoctorAppointments: dbAppointments
        });
      } else {
        // If doctor not found by ID, return empty array
        res.send({
          message: "Doctor not found",
          CurrentDoctorAppointments: []
        });
      }
    } else {
      // If not an ID, assume it's a doctor's full name (backward compatibility)
      const dbAppointments = await appointmentCollecObj.find({ doctor: currentDoctor }).toArray();
      console.log("Found appointments by doctor name:", dbAppointments.length);
      res.send({
        message: "Current Doctor appointments",
        CurrentDoctorAppointments: dbAppointments
      });
    }
  } catch (error) {
    console.error("Error fetching doctor appointments:", error);
    res.status(500).send({
      message: "Error fetching appointments",
      error: error.message
    });
  }
}))

// Post message from contact form
patientApp.post(
  "/messages",
  expressAsyncHandler(async (req, res) => {
    const message = req.body;
    try {
      // Add timestamp to message
      message.createdAt = new Date();
      await messageCollecObj.insertOne(message);
      res.send({ message: "Message sent successfully" });
    } catch (error) {
      res.status(500).send({ message: "Failed to send message", error: error.message });
    }
  })
);

// Get all messages for admin dashboard
patientApp.get(
  "/messages",
  expressAsyncHandler(async (req, res) => {
    try {
      const messages = await messageCollecObj.find().sort({ createdAt: -1 }).toArray();
      res.send({ message: "Messages retrieved successfully", messages });
    } catch (error) {
      res.status(500).send({ message: "Failed to retrieve messages", error: error.message });
    }
  })
);

// Submit feedback
patientApp.post(
  "/feedback",
  expressAsyncHandler(async (req, res) => {
    try {
      const feedbackData = req.body;
      
      // Validate required fields
      if (!feedbackData.appointmentId || !feedbackData.doctorId || !feedbackData.patientId) {
        return res.status(400).send({ 
          message: "Missing required fields",
          details: "appointmentId, doctorId, and patientId are required"
        });
      }
      
      // Convert ObjectId strings to ObjectId objects
      feedbackData.appointmentId = new ObjectId(feedbackData.appointmentId);
      feedbackData.doctorId = new ObjectId(feedbackData.doctorId);
      feedbackData.patientId = new ObjectId(feedbackData.patientId);
      
      // Add timestamps
      feedbackData.createdAt = new Date();
      
      // Get feedback collection
      const feedbackCollecObj = req.app.get("feedbackCollection");
      
      // Insert feedback
      await feedbackCollecObj.insertOne(feedbackData);
      
      // Update appointment to mark feedback as submitted
      if (feedbackData.appointmentId) {
        const appointmentCollecObj = req.app.get("appointmentCollection");
        await appointmentCollecObj.updateOne(
          { _id: feedbackData.appointmentId },
          { $set: { feedbackSubmitted: true } }
        );
      }
      
      res.status(200).send({ 
        message: "Feedback submitted successfully",
        feedback: feedbackData
      });
    } catch (error) {
      console.error("Error submitting feedback:", error);
      res.status(500).send({ 
        message: "Error submitting feedback", 
        error: error.message 
      });
    }
  })
);

// Get patient's submitted feedback
patientApp.get(
  "/feedback/:patientId",
  expressAsyncHandler(async (req, res) => {
    try {
      const patientId = req.params.patientId;
      const feedbackCollecObj = req.app.get("feedbackCollection");
      
      const feedback = await feedbackCollecObj.find({ patientId }).sort({ createdAt: -1 }).toArray();
      
      res.status(200).send({ 
        message: "Patient feedback retrieved successfully",
        feedback
      });
    } catch (error) {
      console.error("Error retrieving patient feedback:", error);
      res.status(500).send({ 
        message: "Error retrieving patient feedback", 
        error: error.message 
      });
    }
  })
);

module.exports = patientApp;
