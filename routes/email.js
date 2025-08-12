const express = require('express');
const router = express.Router();

// Simple email list storage (in production, you could use a proper database collection)
let emailList = [];

// Handle free pick signup - NO EMAIL SENDING
router.post('/free-pick', async (req, res) => {
  try {
    const { email } = req.body;

    // Validate email
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email required' });
    }

    // Add to email list if not already there
    if (!emailList.includes(email.toLowerCase())) {
      emailList.push(email.toLowerCase());
      console.log(`New email added: ${email}`); // For your logs
      console.log(`Total emails collected: ${emailList.length}`); // Track your list growth
    }

    // Return success message (NO EMAIL SENDING)
    res.json({ 
      success: true,
      message: 'You have been successfully registered for this week\'s Free Pick! Email will be sent out prior to the game. Thank you and Good Luck!'
    });

  } catch (error) {
    console.error('Email signup error:', error);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// Get email list (for your admin use)
router.get('/email-list', (req, res) => {
  res.json({ 
    emails: emailList,
    total: emailList.length 
  });
});

// Newsletter endpoint (for future use when you want to send emails)
router.post('/newsletter', async (req, res) => {
  try {
    const { subject, content } = req.body;

    // For now, just return success (you can add real email sending later)
    res.json({ 
      message: `Newsletter would be sent to ${emailList.length} subscribers!`,
      emails: emailList 
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send newsletter' });
  }
});

module.exports = router;
