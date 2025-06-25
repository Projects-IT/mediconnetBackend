const exp = require("express");
const chatApp = exp.Router();
const expressAsyncHandler = require("express-async-handler");
const { ObjectId } = require('mongodb');

// Collections will be initialized in the middleware
let chatsCollectionObj, chatMessagesCollectionObj, faqCollectionObj, 
    patientCollectionObj, doctorCollectionObj, adminCollectionObj, appointmentCollectionObj;

chatApp.use(exp.json());

chatApp.use((req, res, next) => {
  chatsCollectionObj = req.app.get("chatsCollection");
  chatMessagesCollectionObj = req.app.get("chatMessagesCollection");
  faqCollectionObj = req.app.get("faqCollection");
  patientCollectionObj = req.app.get("patientCollection");
  doctorCollectionObj = req.app.get("doctorCollection");
  adminCollectionObj = req.app.get("adminCollection");
  appointmentCollectionObj = req.app.get("appointmentCollection");
  next();
});

// GET /chats/user/:userId - Get all chats for a user
chatApp.get("/chats/user/:userId", expressAsyncHandler(async (req, res) => {
    const { userId } = req.params;

    const chats = await chatsCollectionObj.find({ "participants.userId": userId }).toArray();
      
    const chatsWithDetails = await Promise.all(chats.map(async (chat) => {
        const lastMessageDoc = await chatMessagesCollectionObj.findOne({ chatId: chat._id.toString() }, { sort: { timestamp: -1 } });
        
        const otherParticipants = await Promise.all(chat.participants
            .filter(p => p.userId !== userId)
            .map(async (p) => {
                let user;
                if (p.userType === 'patient') user = await patientCollectionObj.findOne({ _id: new ObjectId(p.userId) });
                else if (p.userType === 'doctor') user = await doctorCollectionObj.findOne({ _id: new ObjectId(p.userId) });
                else if (p.userType === 'admin') user = await adminCollectionObj.findOne({ _id: new ObjectId(p.userId) });
                
                return {
                    userId: p.userId,
                    userType: p.userType,
                    name: user ? `${user.FirstName} ${user.LastName || ''}`.trim() : 'Unknown User',
                    profilePicture: user?.profilePicture,
                    specialization: p.userType === 'doctor' ? user?.specialization : null
                };
            }));
        
        const unreadCount = await chatMessagesCollectionObj.countDocuments({ 
            chatId: chat._id.toString(), 
            isRead: false,
            senderId: { $ne: userId }
        });

        // Ensure lastMessage is just the text, not the whole object.
        const lastMessageText = lastMessageDoc ? (lastMessageDoc.messageType === 'text' ? lastMessageDoc.message : `Sent a ${lastMessageDoc.messageType}`) : (chat.lastMessage || '');

        return { 
            ...chat, 
            lastMessage: lastMessageText, // Return only the message string
            lastMessageTimestamp: lastMessageDoc ? lastMessageDoc.timestamp : chat.lastMessageTimestamp,
            otherParticipants, 
            unreadCount 
        };
    }));
      
    res.send({ message: "Chats retrieved successfully", chats: chatsWithDetails });
}));

// POST /chats/create - Create a new chat
chatApp.post("/chats/create", expressAsyncHandler(async (req, res) => {
    const { participants, chatType, appointmentId } = req.body;
      
    const pUsers = participants.map(p => ({ "participants.userId": p.userId }));
    const existingChat = await chatsCollectionObj.findOne({ $and: pUsers, chatType });
      
    if (existingChat) {
        return res.send({ message: "Chat already exists", chat: existingChat });
    }
      
    const newChatData = {
        participants,
        chatType,
        appointmentId: appointmentId ? new ObjectId(appointmentId) : null,
        createdAt: new Date(),
        lastMessageTimestamp: new Date(),
    };
      
    const result = await chatsCollectionObj.insertOne(newChatData);
    const newChat = await chatsCollectionObj.findOne({_id: result.insertedId});
      
    res.status(201).send({ message: "Chat created successfully", chat: newChat });
}));

// GET /chats/:chatId/messages - Get messages for a chat
chatApp.get("/chats/:chatId/messages", expressAsyncHandler(async (req, res) => {
    const { chatId } = req.params;
    const messages = await chatMessagesCollectionObj.find({ chatId }).sort({ timestamp: 1 }).toArray();
    res.send({ message: "Messages retrieved successfully", messages });
}));

// POST /chats/:chatId/message - Send a text message
chatApp.post("/chats/:chatId/message", expressAsyncHandler(async (req, res) => {
    const { chatId } = req.params;
    const { senderId, senderType, message } = req.body;

    const dbMessage = {
        chatId,
        senderId,
        senderType,
        message: message.trim(),
        messageType: 'text',
        fileName: null,
        isRead: false,
        timestamp: new Date()
    };
      
    const result = await chatMessagesCollectionObj.insertOne(dbMessage);
    dbMessage._id = result.insertedId;

    await chatsCollectionObj.updateOne(
        { _id: new ObjectId(chatId) },
        { $set: { lastMessage: dbMessage.message, lastMessageTimestamp: dbMessage.timestamp } }
    );
      
    // Broadcast the new message to the chat room
    req.io.to(chatId).emit('newMessage', { chatId, dbMessage });
      
    res.status(201).send({ message: "Message sent successfully", dbMessage });
}));

// POST /upload-and-send - Upload file and send message
const upload = require('../middlewares/multer');
chatApp.post('/upload-and-send', upload.single('file'), expressAsyncHandler(async (req, res) => {
    const { senderId, senderType, chatId } = req.body;
    const file = req.file;

    if (!file) {
        return res.status(400).send({ message: "File is required." });
    }

    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${file.filename}`;

    const dbMessage = {
        chatId,
        senderId,
        senderType,
        message: fileUrl,
        messageType: file.mimetype.startsWith('image/') ? 'image' : 'document',
        fileName: file.originalname,
        isRead: false,
        timestamp: new Date()
    };

    const result = await chatMessagesCollectionObj.insertOne(dbMessage);
    dbMessage._id = result.insertedId;
    
    await chatsCollectionObj.updateOne(
        { _id: new ObjectId(chatId) },
        { $set: { lastMessage: dbMessage.fileName, lastMessageTimestamp: dbMessage.timestamp } }
    );
    
    req.io.to(chatId).emit('newMessage', { chatId, dbMessage });
    
    res.status(201).send({ message: "File sent successfully", dbMessage });
}));

// PUT /chats/:chatId/read - Mark messages as read
chatApp.put("/chats/:chatId/read", expressAsyncHandler(async (req, res) => {
    const { chatId } = req.params;
    const { userId } = req.body;

    await chatMessagesCollectionObj.updateMany(
        { chatId, senderId: { $ne: userId }, isRead: false },
        { $set: { isRead: true } }
    );

    // Notify the room that messages have been read
    req.io.to(chatId).emit('messagesRead', { chatId, readBy: userId });
      
    res.send({ message: "Messages marked as read" });
}));

// --- FAQ Management ---

// GET /faq - Get all FAQs based on audience
chatApp.get("/faq", expressAsyncHandler(async (req, res) => {
    const { audience } = req.query; // 'patient', 'doctor'
    const filter = { isActive: true };
    if (audience) {
        filter.targetAudience = { $in: [audience, 'all'] };
    }
    const faqs = await faqCollectionObj.find(filter).toArray();
    res.send({ message: "FAQs retrieved successfully", faqs });
}));

// POST /faq - Add new FAQ (admin only)
chatApp.post("/faq", expressAsyncHandler(async (req, res) => {
    const { question, answer, category, targetAudience } = req.body;
    const newFaq = {
        question,
        answer,
        category: category || 'General',
        targetAudience: targetAudience || 'all',
        isActive: true,
        createdAt: new Date()
    };
    const result = await faqCollectionObj.insertOne(newFaq);
    res.status(201).send({ message: "FAQ added successfully", faqId: result.insertedId });
}));

// PUT /faq/:id - Update FAQ (admin only)
chatApp.put("/faq/:id", expressAsyncHandler(async (req, res) => {
    const { id } = req.params;
    const { question, answer, category, targetAudience, isActive } = req.body;
    
    const updateData = { question, answer, category, targetAudience, isActive };
    // Remove undefined fields so they don't overwrite existing data
    Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

    const result = await faqCollectionObj.updateOne({ _id: new ObjectId(id) }, { $set: updateData });
    if (result.matchedCount === 0) {
        return res.status(404).send({ message: "FAQ not found" });
    }
    res.send({ message: "FAQ updated successfully" });
}));

// DELETE /faq/:id - Delete FAQ (admin only)
chatApp.delete("/faq/:id", expressAsyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await faqCollectionObj.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
        return res.status(404).send({ message: "FAQ not found" });
    }
    res.send({ message: "FAQ deleted successfully" });
}));


module.exports = chatApp;