const exp = require("express");
const feedbackApp = exp.Router();
const expressAsyncHandler = require("express-async-handler");
const ObjectId = require('mongodb').ObjectId;

// Get collections
let feedbackCollecObj;
let doctorCollecObj;

feedbackApp.use((req, res, next) => {
  feedbackCollecObj = req.app.get("feedbackCollection");
  doctorCollecObj = req.app.get("doctorCollection");
  next();
});

// Submit feedback
feedbackApp.post("/submit", expressAsyncHandler(async (req, res) => {
  try {
    const feedbackData = req.body;
    
    // Add timestamps
    feedbackData.createdAt = new Date();
    
    // Insert feedback
    await feedbackCollecObj.insertOne(feedbackData);
    
    // Update appointment to mark feedback as submitted
    if (feedbackData.appointmentId) {
      const appointmentCollecObj = req.app.get("appointmentCollection");
      await appointmentCollecObj.updateOne(
        { _id: new ObjectId(feedbackData.appointmentId) },
        { $set: { feedbackSubmitted: true } }
      );
    }
    
    // Update doctor's overall rating
    if (feedbackData.doctorId) {
      await updateDoctorRating(feedbackData.doctorId);
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
}));

// Get all feedback
feedbackApp.get("/all", expressAsyncHandler(async (req, res) => {
  try {
    const feedback = await feedbackCollecObj.find({}).sort({ createdAt: -1 }).toArray();
    
    res.status(200).send({ 
      message: "Feedback retrieved successfully",
      feedback
    });
  } catch (error) {
    console.error("Error retrieving feedback:", error);
    res.status(500).send({ 
      message: "Error retrieving feedback", 
      error: error.message 
    });
  }
}));

// Get feedback by doctor ID
feedbackApp.get("/doctor/:doctorId", expressAsyncHandler(async (req, res) => {
  try {
    const doctorId = req.params.doctorId;
    
    // Try to convert to ObjectId if it's a valid format
    let searchQuery;
    try {
      searchQuery = { doctorId: new ObjectId(doctorId) };
    } catch (err) {
      // If not a valid ObjectId format, search as string
      searchQuery = { doctorId: doctorId };
    }
    
    // Search for feedback with both ObjectId and string formats
    const feedback = await feedbackCollecObj.find({ 
      $or: [
        searchQuery,
        { doctorId: doctorId }
      ]
    }).sort({ createdAt: -1 }).toArray();
    
    res.status(200).send({ 
      message: "Doctor feedback retrieved successfully",
      feedback
    });
  } catch (error) {
    console.error("Error retrieving doctor feedback:", error);
    res.status(500).send({ 
      message: "Error retrieving doctor feedback", 
      error: error.message 
    });
  }
}));

// Get feedback by patient ID
feedbackApp.get("/patient/:patientId", expressAsyncHandler(async (req, res) => {
  try {
    const patientId = req.params.patientId;
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
}));

// Get all feedback - additional endpoint for dashboard
feedbackApp.get("/all-feedback", expressAsyncHandler(async (req, res) => {
  try {
    const feedbacks = await feedbackCollecObj.find({}).sort({ createdAt: -1 }).toArray();
    
    res.status(200).send({ 
      message: "All feedback retrieved successfully",
      feedbacks
    });
  } catch (error) {
    console.error("Error retrieving all feedback:", error);
    res.status(500).send({ 
      message: "Error retrieving all feedback", 
      error: error.message 
    });
  }
}));

// Helper function to update doctor's overall rating
async function updateDoctorRating(doctorId) {
  try {
    // Get all feedback for this doctor
    const doctorFeedback = await feedbackCollecObj.find({ doctorId }).toArray();
    
    if (doctorFeedback.length === 0) return;
    
    // Calculate average rating
    let totalRating = 0;
    doctorFeedback.forEach(feedback => {
      totalRating += feedback.ratings.overall;
    });
    
    const averageRating = totalRating / doctorFeedback.length;
    
    // Update doctor document
    await doctorCollecObj.updateOne(
      { _id: new ObjectId(doctorId) },
      { 
        $set: { 
          rating: averageRating.toFixed(1),
          totalReviews: doctorFeedback.length
        } 
      }
    );
  } catch (error) {
    console.error("Error updating doctor rating:", error);
  }
}

module.exports = feedbackApp; 