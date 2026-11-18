import React from 'react';
import { X } from 'lucide-react';
import type { StoreSettings } from '../types/store';
import { formatINR } from '../utils/commerce';

export type PolicyTopic = 'shipping' | 'returns' | 'privacy' | null;

interface PolicyModalProps {
  topic: PolicyTopic;
  settings: StoreSettings;
  onClose: () => void;
}

export const PolicyModal: React.FC<PolicyModalProps> = ({ topic, settings, onClose }) => {
  if (!topic) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Store policy information"
    >
      <div className="bg-white border border-neutral-200 rounded-xl max-w-lg w-full overflow-hidden shadow-2xl text-[#111111]">
        <div className="px-5 py-4 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between">
          <h2 className="font-display text-2xl uppercase text-[#111111]">
            {topic === 'shipping'
              ? 'Pan-India Shipping'
              : topic === 'returns'
              ? '7-Day Size Exchange & Returns'
              : 'Privacy & Order Terms'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close policy dialog"
            className="p-1.5 rounded hover:bg-neutral-200 text-neutral-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 text-sm text-neutral-700 space-y-3 leading-relaxed">
          {topic === 'shipping' && (
            <>
              <p>
                Orders above{' '}
                <strong className="text-[#111111]">
                  {formatINR(settings.freeShippingThresholdINR)}
                </strong>{' '}
                ship free across India. Orders under the threshold carry a flat{' '}
                <strong className="text-[#111111]">{formatINR(settings.shippingFeeINR)}</strong>{' '}
                courier fee.
              </p>
              <p>
                Dispatch takes 24–48 business hours from our New Delhi studio after COD or UPI UTR
                confirmation. Metro delivery takes 2–4 days; rest of India 4–6 days.
              </p>
            </>
          )}

          {topic === 'returns' && (
            <>
              <p>
                Unworn garments with original SC hangtags intact are eligible for a 7-day size
                exchange or store credit from the date of delivery.
              </p>
              <p>
                To request a size swap, message our WhatsApp support desk with your{' '}
                <strong className="text-[#111111]">SC-IN-XXXXXX</strong> Order ID and unboxing
                video/photo.
              </p>
            </>
          )}

          {topic === 'privacy' && (
            <>
              <p>
                Customer phone numbers and delivery addresses are isolated strictly for courier
                fulfillment and COD/UPI verification. Saucy Culture never sells or shares member
                contact lists.
              </p>
              <p>
                Support Desk: {settings.supportEmail} · WhatsApp +{settings.supportWhatsapp}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
