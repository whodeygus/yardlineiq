const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const User = require('../models/User');
const router = express.Router();

// Create payment intent
router.post('/create-payment-intent', async (req, res) => {
  try {
    const { amount, currency, packageType, userEmail } = req.body;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount * 100, // Convert to cents
      currency: currency || 'usd',
      metadata: {
        packageType,
        userEmail
      }
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Handle successful payment
router.post('/payment-success', async (req, res) => {
  try {
    const { paymentIntentId, userEmail, packageType } = req.body;

    // Verify payment with Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    if (paymentIntent.status === 'succeeded') {
      // Check if user exists, if not create them
      let user = await User.findOne({ email: userEmail });
      
      if (!user) {
        // Create new user with temporary password
        const tempPassword = Math.random().toString(36).slice(-8);
        user = new User({
          email: userEmail,
          password: tempPassword,
          firstName: userEmail.split('@')[0],
          lastName: 'Member',
          subscription: packageType
        });
      } else {
        user.subscription = packageType;
      }
      
      // Set subscription end date
      if (packageType === 'weekly') {
        user.subscriptionEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      } else if (packageType === 'monthly') {
        user.subscriptionEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      } else if (packageType === 'season') {
        user.subscriptionEnd = new Date('2025-02-15'); // End of NFL season
      }
      
      await user.save();

      res.json({ success: true, message: 'Payment processed successfully!' });
    } else {
      res.status(400).json({ error: 'Payment not successful' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
