const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const User = require('../models/User');
const nodemailer = require('nodemailer');
const router = express.Router();

// Email transporter setup - FIXED SYNTAX
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER, // admin@yardlineiq.com
    pass: process.env.EMAIL_PASSWORD
  }
});

// Create payment intent - UPDATED to include customer info
router.post('/create-payment-intent', async (req, res) => {
  try {
    const { amount, currency, packageType, customerInfo } = req.body;
    
    // Validate customer information
    if (!customerInfo || !customerInfo.name || !customerInfo.email) {
      return res.status(400).json({ error: 'Customer name and email are required' });
    }
    
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount * 100, // Convert to cents
      currency: currency || 'usd',
      metadata: {
        packageType,
        userEmail: customerInfo.email,
        userName: customerInfo.name,
        purchaseDate: new Date().toISOString()
      }
    });
    
    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });
  } catch (error) {
    console.error('Payment intent creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Handle successful payment - UPDATED with better user management and notifications
router.post('/payment-success', async (req, res) => {
  try {
    const { paymentIntentId, customerInfo, packageType } = req.body;
    
    if (!customerInfo || !customerInfo.email || !customerInfo.name) {
      return res.status(400).json({ error: 'Customer information is required' });
    }
    
    // Verify payment with Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    if (paymentIntent.status === 'succeeded') {
      // Check if user exists, if not create them
      let user = await User.findOne({ email: customerInfo.email });
      
      if (!user) {
        // Create new user with customer info
        const tempPassword = Math.random().toString(36).slice(-8);
        user = new User({
          email: customerInfo.email,
          password: tempPassword,
          firstName: customerInfo.name.split(' ')[0] || customerInfo.name,
          lastName: customerInfo.name.split(' ').slice(1).join(' ') || 'Member',
          subscription: packageType,
          paymentIntentId: paymentIntentId,
          purchaseDate: new Date()
        });
      } else {
        // Update existing user
        user.subscription = packageType;
        user.paymentIntentId = paymentIntentId;
        user.purchaseDate = new Date();
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
      
      // Send notification emails - only if email is configured
      if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
        await sendNotificationEmails(user, packageType, paymentIntentId);
      }
      
      res.json({ 
        success: true, 
        message: 'Payment processed successfully!',
        userId: user._id,
        subscriptionEnd: user.subscriptionEnd
      });
    } else {
      res.status(400).json({ error: 'Payment not successful' });
    }
  } catch (error) {
    console.error('Payment success error:', error);
    res.status(500).json({ error: error.message });
  }
});

// NEW ROUTE: Get all customers for admin dashboard
router.get('/customers', async (req, res) => {
  try {
    const customers = await User.find({ subscription: { $exists: true } })
      .select('firstName lastName email subscription subscriptionEnd purchaseDate paymentIntentId')
      .sort({ purchaseDate: -1 });
    
    const formattedCustomers = customers.map(customer => ({
      id: customer._id,
      name: `${customer.firstName} ${customer.lastName}`,
      email: customer.email,
      packageType: customer.subscription,
      purchaseDate: customer.purchaseDate,
      subscriptionEnd: customer.subscriptionEnd,
      paymentId: customer.paymentIntentId
    }));
    
    res.json({ customers: formattedCustomers });
  } catch (error) {
    console.error('Get customers error:', error);
    res.status(500).json({ error: error.message });
  }
});

// NEW ROUTE: Get dashboard stats
router.get('/stats', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const paidSubscribers = await User.countDocuments({ subscription: { $exists: true } });
    
    // You can add more stats here as needed
    res.json({
      totalUsers,
      paidSubscribers,
      totalPicks: 0, // Update with actual picks count
      emailSignups: 0, // Update with actual email signups
      winRate: 61
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Function to send notification emails
async function sendNotificationEmails(user, packageType, paymentIntentId) {
  try {
    const emailContent = `
New Customer Purchase!

Customer: ${user.firstName} ${user.lastName}
Email: ${user.email}
Package: ${packageType}
Purchase Date: ${user.purchaseDate.toLocaleString()}
Subscription End: ${user.subscriptionEnd.toLocaleString()}
Payment ID: ${paymentIntentId}

Customer has been added to the database and is ready for access.
    `;

    // Send to both admin emails
    const adminEmails = ['admin@yardlineiq.com', 'gustin.puckett@gmail.com'];
    
    for (const email of adminEmails) {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: `New YardLineIQ Purchase - ${packageType}`,
        text: emailContent
      });
    }

    console.log('Notification emails sent successfully');
  } catch (error) {
    console.error('Email sending error:', error);
    // Don't throw error - payment should still succeed even if email fails
  }
}

module.exports = router;
