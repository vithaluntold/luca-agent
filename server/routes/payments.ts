/**
 * Payment Routes for Cashfree Integration
 * Handles subscription payments and tier upgrades
 */

import { Express } from 'express';
import { cashfreeService } from '../services/cashfreeService';
import { db } from '../db';
import { payments, subscriptions, users } from '../../shared/schema';
import { eq } from 'drizzle-orm';

export function registerPaymentRoutes(app: Express) {
  /**
   * GET /api/payments/plans
   * Get all available subscription plans
   */
  app.get('/api/payments/plans', (req, res) => {
    try {
      const plans = cashfreeService.getAllPlans();
      res.json({ plans });
    } catch (error) {
      console.error('[Payments] Error fetching plans:', error);
      res.status(500).json({ error: 'Failed to fetch plans' });
    }
  });

  /**
   * POST /api/payments/create-order
   * Create a Cashfree payment order for subscription
   */
  app.post('/api/payments/create-order', async (req, res) => {
    try {
      const userId = req.session?.userId;
      
      if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const { planId, customerName, customerEmail, customerPhone } = req.body;

      if (!planId) {
        return res.status(400).json({ error: 'Plan ID is required' });
      }

      const plan = cashfreeService.getPlan(planId);
      if (!plan) {
        return res.status(400).json({ error: 'Invalid plan ID' });
      }

      // Create payment order in Cashfree
      const order = await cashfreeService.createPaymentOrder({
        userId,
        planId,
        customerName: customerName || 'Luca User',
        customerEmail: customerEmail || '',
        customerPhone: customerPhone || '',
      });

      // Create payment record in database
      await db.insert(payments).values({
        userId,
        amount: order.orderAmount * 100, // Convert to paise
        currency: order.orderCurrency,
        status: 'pending',
        paymentGateway: 'cashfree',
        gatewayOrderId: order.orderId,
        metadata: {
          planId,
          planName: plan.name,
          tier: plan.tier,
          duration: plan.duration,
        },
      });

      res.json({
        success: true,
        order: {
          orderId: order.orderId,
          orderToken: order.orderToken,
          paymentSessionId: order.paymentSessionId,
          amount: order.orderAmount,
          currency: order.orderCurrency,
        },
        plan: {
          id: planId,
          name: plan.name,
          tier: plan.tier,
        },
      });
    } catch (error) {
      console.error('[Payments] Error creating order:', error);
      res.status(500).json({ error: 'Failed to create payment order' });
    }
  });

  /**
   * POST /api/payments/verify
   * Verify payment and upgrade user subscription tier
   */
  app.post('/api/payments/verify', async (req, res) => {
    try {
      const userId = req.session?.userId;
      
      if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const { orderId } = req.body;

      if (!orderId) {
        return res.status(400).json({ error: 'Order ID is required' });
      }

      // Verify payment with Cashfree
      const verification = await cashfreeService.verifyPayment(orderId);

      if (verification.status !== 'SUCCESS') {
        // Update payment record as failed
        await db
          .update(payments)
          .set({
            status: 'failed',
            failureReason: `Payment status: ${verification.status}`,
            updatedAt: new Date(),
          })
          .where(eq(payments.gatewayOrderId, orderId));

        return res.status(400).json({
          success: false,
          error: 'Payment verification failed',
          status: verification.status,
        });
      }

      // Get payment record to extract plan details
      const [paymentRecord] = await db
        .select()
        .from(payments)
        .where(eq(payments.gatewayOrderId, orderId))
        .limit(1);

      if (!paymentRecord) {
        return res.status(404).json({ error: 'Payment record not found' });
      }

      const metadata = paymentRecord.metadata as any;
      const planId = metadata?.planId;
      const plan = cashfreeService.getPlan(planId);

      if (!plan) {
        return res.status(400).json({ error: 'Invalid plan' });
      }

      // Calculate subscription period
      const currentPeriodStart = new Date();
      const currentPeriodEnd = new Date();
      currentPeriodEnd.setDate(currentPeriodEnd.getDate() + plan.duration);

      // Create or update subscription
      const [subscription] = await db
        .insert(subscriptions)
        .values({
          userId,
          plan: plan.tier,
          status: 'active',
          billingCycle: plan.duration === 30 ? 'monthly' : 'annual',
          amount: plan.price,
          currency: plan.currency,
          paymentGateway: 'cashfree',
          gatewaySubscriptionId: orderId,
          currentPeriodStart,
          currentPeriodEnd,
        })
        .onConflictDoUpdate({
          target: subscriptions.userId,
          set: {
            plan: plan.tier,
            status: 'active',
            billingCycle: plan.duration === 30 ? 'monthly' : 'annual',
            amount: plan.price,
            currency: plan.currency,
            currentPeriodStart,
            currentPeriodEnd,
            updatedAt: new Date(),
          },
        })
        .returning();

      // Update payment record
      await db
        .update(payments)
        .set({
          subscriptionId: subscription.id,
          status: 'successful',
          gatewayPaymentId: verification.paymentDetails.cf_payment_id,
          paymentMethod: verification.paymentDetails.payment_method,
          updatedAt: new Date(),
        })
        .where(eq(payments.gatewayOrderId, orderId));

      // CRITICAL: Update user tier immediately (real-time upgrade)
      await db
        .update(users)
        .set({
          subscriptionTier: plan.tier,
        })
        .where(eq(users.id, userId));

      console.log(`[Payments] User ${userId} upgraded to ${plan.tier}`);

      res.json({
        success: true,
        subscription: {
          plan: plan.tier,
          status: 'active',
          currentPeriodEnd,
        },
        message: `Successfully upgraded to ${plan.name}!`,
      });
    } catch (error) {
      console.error('[Payments] Error verifying payment:', error);
      res.status(500).json({ error: 'Failed to verify payment' });
    }
  });

  /**
   * POST /api/payments/webhook
   * Handle Cashfree webhook notifications
   */
  app.post('/api/payments/webhook', async (req, res) => {
    try {
      const signature = req.headers['x-webhook-signature'] as string;
      const timestamp = req.headers['x-webhook-timestamp'] as string;
      const rawBody = JSON.stringify(req.body);

      // Verify webhook signature
      const isValid = cashfreeService.verifyWebhookSignature(
        rawBody,
        signature,
        timestamp
      );

      if (!isValid) {
        console.error('[Payments] Invalid webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }

      // Process webhook
      const result = await cashfreeService.handleWebhook(req.body);

      if (result.shouldUpgradeTier && result.newTier) {
        // Update user tier
        await db
          .update(users)
          .set({
            subscriptionTier: result.newTier,
          })
          .where(eq(users.id, result.userId));

        // Update subscription
        await db
          .update(subscriptions)
          .set({
            status: 'active',
            currentPeriodEnd: result.expiresAt,
            updatedAt: new Date(),
          })
          .where(eq(subscriptions.gatewaySubscriptionId, result.orderId));

        console.log(`[Webhook] User ${result.userId} upgraded to ${result.newTier}`);
      }

      res.json({ success: true });
    } catch (error) {
      console.error('[Payments] Webhook error:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  /**
   * GET /api/payments/subscription
   * Get current user's subscription details
   */
  app.get('/api/payments/subscription', async (req, res) => {
    try {
      const userId = req.session?.userId;
      
      if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const [subscription] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, userId))
        .limit(1);

      if (!subscription) {
        return res.json({
          plan: 'free',
          status: 'active',
          features: ['Basic features', 'Limited queries'],
        });
      }

      res.json({
        plan: subscription.plan,
        status: subscription.status,
        billingCycle: subscription.billingCycle,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAt: subscription.cancelAt,
      });
    } catch (error) {
      console.error('[Payments] Error fetching subscription:', error);
      res.status(500).json({ error: 'Failed to fetch subscription' });
    }
  });
}
