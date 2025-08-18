const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

// Email signup schema - this creates a table in MongoDB to store emails
const emailSignupSchema = new mongoose.Schema({
  email: { 
    type: String, 
    required: true, 
    unique: true,
    lowercase: true 
  },
  signupDate: { 
    type: Date, 
    default: Date.now 
  }
});

const EmailSignup = mongoose.model('EmailSignup', emailSignupSchema);

// Handle free pick signup - saves email to database
router.post('/free-pick', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email required' });
    }

    // Save email to MongoDB database
    const newSignup = new EmailSignup({ email: email.toLowerCase() });
    await newSignup.save();
    
    console.log(`New email saved to database: ${email}`);
    
    res.json({ 
      success: true,
      message: 'You have been successfully registered for this week\'s Free Pick! Email will be sent out prior to the game. Thank you and Good Luck!'
    });
  } catch (error) {
    if (error.code === 11000) {
      // Email already exists - still show success message
      res.json({ 
        success: true,
        message: 'You have been successfully registered for this week\'s Free Pick! Email will be sent out prior to the game. Thank you and Good Luck!'
      });
    } else {
      console.error('Email signup error:', error);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  }
});

// Get all emails for admin page
router.get('/email-list', async (req, res) => {
  try {
    const emails = await EmailSignup.find().sort({ signupDate: -1 });
    res.json({ 
      emails: emails,
      total: emails.length 
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch emails' });
  }
});

module.exports = router;
