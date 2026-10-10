const CHECKOUT_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

/** What Checkout hands the browser after a successful payment; the API verifies the signature. */
export interface CheckoutFields {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayCheckout {
  open(): void;
  on(event: "payment.failed", handler: (response: { error?: { description?: string } }) => void): void;
}

type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayCheckout;

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

let loading: Promise<RazorpayConstructor> | null = null;

/** Razorpay's script is loaded only when someone is about to pay, and only once. */
export function loadRazorpay(): Promise<RazorpayConstructor> {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  loading ??= new Promise<RazorpayConstructor>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = CHECKOUT_SCRIPT;
    script.async = true;
    script.onload = () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error("Razorpay Checkout loaded without its constructor")));
    script.onerror = () => {
      script.remove();
      reject(new Error("Razorpay Checkout script failed to load"));
    };
    document.head.append(script);
  }).catch((error: unknown) => {
    loading = null;
    throw error;
  });
  return loading;
}

interface Handlers {
  onPaid: (fields: CheckoutFields) => void;
  onFailed: (description: string) => void;
}

export function openCheckout(Razorpay: RazorpayConstructor, options: Record<string, unknown>, { onPaid, onFailed }: Handlers): void {
  const checkout = new Razorpay({ ...options, handler: onPaid });
  checkout.on("payment.failed", (response) => onFailed(response.error?.description ?? "The payment was declined."));
  checkout.open();
}
