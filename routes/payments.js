const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const router = express.Router();

// Simple in-memory storage for now (will persist until server restart)
let customers = [];

// Create payment intent - basic version that works
router.post('/create-payment-intent', async (req, res) => {
  try {
    const { amount, currency, packageType, customerInfo } = req.body;
    
    if (!customerInfo || !customerInfo.name || !customerInfo.email) {
      return res.status(400).json({ error: 'Customer name and email are required' });
    }
    
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount * 100,
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

// Handle successful payment - saves to memory for now
router.post('/payment-success', async (req, res) => {
  try {
    const { paymentIntentId, customerInfo, packageType } = req.body;
    
    if (!customerInfo || !customerInfo.email || !customerInfo.name) {
      return res.status(400).json({ error: 'Customer information is required' });
    }
    
    // Verify payment with Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    if (paymentIntent.status === 'succeeded') {
      // Calculate subscription end date
      let subscriptionEnd;
      if (packageType === 'weekly') {
        subscriptionEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      } else if (packageType === 'monthly') {
        subscriptionEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      } else if (packageType === 'season') {
        subscriptionEnd = new Date('2025-02-15');
      }

      // Save customer to memory
      const customer = {
        id: Date.now(), // Simple ID
        name: customerInfo.name,
        email: customerInfo.email,
        packageType: packageType,
        purchaseDate: new Date(),
        subscriptionEnd: subscriptionEnd,
        paymentId: paymentIntentId,
        status: 'active'
      };

      // Remove any existing customer with same email
      customers = customers.filter(c => c.email !== customerInfo.email);
      // Add new customer
      customers.push(customer);

      console.log('Customer saved:', customer);

      res.json({
        success: true,
        message: 'Payment processed successfully!',
        userId: customer.id,
        subscriptionEnd: subscriptionEnd
      });
    } else {
      res.status(400).json({ error: 'Payment not successful' });
    }
  } catch (error) {
    console.error('Payment success error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get customers for admin dashboard
router.get('/customers', async (req, res) => {
  try {
    res.json({ customers: customers.reverse() }); // Show newest first
  } catch (error) {
    console.error('Get customers error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get dashboard stats
router.get('/stats', async (req, res) => {
  try {
    res.json({
      totalUsers: customers.length,
      paidSubscribers: customers.length,
      totalPicks: 0,
      emailSignups: 0,
      winRate: 61
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
