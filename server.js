const exp = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = exp();

// Socket.io setup
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: ["http://localhost:3000", "http://localhost:3001"], // Allow both frontend and dashboard
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});

// Middleware to pass io instance to routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// CORS configuration - must come before routes
app.use(
    cors({
      origin: [process.env.FRONTEND_URL_ONE, process.env.FRONTEND_URL_TWO || "http://localhost:3001"],
      methods: ["GET", "POST", "DELETE", "PUT"],
      credentials: true,
      exposedHeaders: ['Content-Disposition']
    })
  );

// Make uploads directory accessible as static files
app.use('/uploads', exp.static('uploads'));

//const Patient Api
const patientApp=require("./Api/patient")

//const Doctor Api
const doctorApp=require('./Api/doctors')

// Admin Api
const adminApp=require('./Api/admin')

// Feedback Api
const feedbackApp=require('./Api/feedback')

// Chat Api
const chatApp=require('./Api/chat')

const mongoClient=require('mongodb').MongoClient

// MongoDB Atlas connection string
const MONGODB_URI = process.env.DB_PORT

mongoClient.connect(MONGODB_URI)
.then((client)=>{
    let dbobj=client.db("Mediconnect")
    let patientCollection=dbobj.collection('patientCollection')
    let appointmentCollection=dbobj.collection('appointmentCollection')
    let doctorCollection=dbobj.collection('doctorCollection')
    let adminCollection=dbobj.collection('adminCollection')
    let messageCollection=dbobj.collection('messageCollection')
    let deletedDoctorCollection=dbobj.collection('deletedDoctorCollection')
    let feedbackCollection=dbobj.collection('feedbackCollection')
    let chatsCollection=dbobj.collection('chatsCollection')
    let chatMessagesCollection=dbobj.collection('chatMessagesCollection')
    let faqCollection=dbobj.collection('faqCollection')
    
    app.set("patientCollection",patientCollection)
    app.set("appointmentCollection",appointmentCollection)
    app.set("doctorCollection",doctorCollection)
    app.set("adminCollection",adminCollection)
    app.set("messageCollection",messageCollection)
    app.set("deletedDoctorCollection", deletedDoctorCollection)
    app.set("feedbackCollection", feedbackCollection)
    app.set("chatsCollection", chatsCollection)
    app.set("chatMessagesCollection", chatMessagesCollection)
    app.set("faqCollection", faqCollection)
    
    console.log("MongoDB Atlas connected successfully");
})
.catch(err => {
    console.error("MongoDB connection error:", err);
})


//when patient patientApp
app.use('/patient-api',patientApp)

//when doctor data doctorApp
app.use('/doctor-api',doctorApp)

//when admin
app.use('/admin-api',adminApp)

//when feedback
app.use('/feedback-api',feedbackApp)

//when chat
app.use('/chat-api',chatApp)

// app.use((req,res,next)=>{
//     res.sendFile(path.join(__dirname,'../client/build/index.html'))
// })

app.use((err,req,res,next)=>{
    res.send({message:"err",payload:err.message})
})

// Socket.io connection logic
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('joinChat', (chatId) => {
    socket.join(chatId);
    console.log(`User ${socket.id} joined room ${chatId}`);
  });
  
  socket.on('leaveChat', (chatId) => {
      socket.leave(chatId);
      console.log(`User ${socket.id} left room ${chatId}`);
  });

  socket.on('startTyping', ({ chatId, userName }) => {
    socket.to(chatId).emit('typing', { userName });
  });

  socket.on('stopTyping', ({ chatId }) => {
    socket.to(chatId).emit('stopTyping');
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

let port=process.env.PORT || 4000
httpServer.listen(port,()=>{
    console.log("server running on port",port);
})