const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI);

// Email schema
const emailSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    unique: true
  },
  signupDate: {
    type: Date,
    default: Date.now
  },
  source: {
    type: String,
    default: 'free-pick'
  }
});

const Email = mongoose.model('Email', emailSchema);

// Handle free pick signup
router.post('/free-pick', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email required' });
    }
    
    // Try to save email to MongoDB
    const newEmail = new Email({
      email: email.toLowerCase(),
      source: 'free-pick'
    });
    
    try {
      await newEmail.save();
      console.log(`New email saved to MongoDB: ${email}`);
    } catch (error) {
      if (error.code === 11000) {
        // Duplicate email - that's okay, just continue
        console.log(`Email already exists: ${email}`);
      } else {
        console.error('MongoDB save error:', error);
      }
    }
    
    res.json({ 
      success: true,
      message: 'You have been successfully registered for this week\'s Free Pick! Email will be sent out prior to the game. Thank you and Good Luck!'
    });
  } catch (error) {
    console.error('Email signup error:', error);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// Get email list
router.get('/email-list', async (req, res) => {
  try {
    const emails = await Email.find({ source: 'free-pick' })
      .sort({ signupDate: -1 })
      .select('email signupDate');
    
    res.json({ 
      emails: emails,
      total: emails.length 
    });
  } catch (error) {
    console.error('Failed to load email list:', error);
    res.status(500).json({ error: 'Failed to load emails' });
  }
});

// Export emails (WITHOUT deleting them)
router.get('/export-emails', async (req, res) => {
  try {
    const emails = await Email.find({ source: 'free-pick' })
      .sort({ signupDate: -1 })
      .select('email signupDate');
    
    const csvContent = 'Email,Signup Date\n' + 
      emails.map(entry => `${entry.email},${entry.signupDate.toISOString()}`).join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="yardline-emails.csv"');
    res.send(csvContent);
    
    console.log(`Exported ${emails.length} emails (kept in system)`);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Failed to export emails' });
  }
});

module.exports = router;
