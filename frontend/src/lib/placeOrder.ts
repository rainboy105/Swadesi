import { api } from "./api";

type RazorpayCtor = new (o: unknown) => { open: () => void };

/**
 * Place an order and, if payment is required, run the Razorpay checkout.
 * Resolves when the order is settled (paid/placed) or the user dismisses checkout.
 * Throws with a friendly message on failure.
 */
export async function placeOrderFlow(
  listingId: string,
  qty: number,
  dishTitle: string,
): Promise<void> {
  const res = await api.placeOrder(listingId, qty);
  if (!res.paymentRequired) return;

  const Razorpay = (window as unknown as { Razorpay?: RazorpayCtor }).Razorpay;
  if (!Razorpay) {
    await api.cancelUnpaidOrder(res.order.id);
    throw new Error("Payment couldn't load. Please retry.");
  }

  await new Promise<void>((resolve, reject) => {
    const rzp = new Razorpay({
      key: res.razorpayKeyId,
      order_id: res.razorpayOrderId,
      amount: res.amountPaise,
      currency: res.currency ?? "INR",
      name: "Swaadesi",
      description: `${qty} × ${res.dish ?? dishTitle}`,
      handler: async (r: {
        razorpay_order_id: string;
        razorpay_payment_id: string;
        razorpay_signature: string;
      }) => {
        try {
          await api.verifyPayment(res.order.id, {
            razorpayOrderId: r.razorpay_order_id,
            razorpayPaymentId: r.razorpay_payment_id,
            razorpaySignature: r.razorpay_signature,
          });
          resolve();
        } catch {
          reject(new Error("Payment taken but verification failed — contact support."));
        }
      },
      modal: {
        ondismiss: async () => {
          await api.cancelUnpaidOrder(res.order.id);
          resolve();
        },
      },
      theme: { color: "#7c3aed" },
    });
    rzp.open();
  });
}
