const express = require('express');
const router = express.Router();

// Simple email list storage
let emailList = [];

// Handle free pick signup
router.post('/free-pick', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email required' });
    }
    
    if (!emailList.includes(email.toLowerCase())) {
      emailList.push(email.toLowerCase());
      console.log(`New email added: ${email}`);
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
router.get('/email-list', (req, res) => {
  res.json({ 
    emails: emailList.map(email => ({ email, signupDate: new Date() })),
    total: emailList.length 
  });
});

module.exports = router;
