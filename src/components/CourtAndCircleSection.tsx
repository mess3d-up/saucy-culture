import React, { useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import { LOOKBOOK_SHOTS } from '../data/catalog';
import { joinOurCircle } from '../lib/api';
import { APPAREL_SIZES, type ApparelSize } from '../types/store';

interface CourtAndCircleSectionProps {
  vipPromoCode: string;
  vipDiscountPercent: number;
  onApplyVipCode?: (code: string) => void;
}

const SIZE_CHART_ROWS = [
  { size: 'S', chest: '42.0"', length: '27.5"', shoulder: '20.5"', fitNote: '5\'5" – 5\'8"' },
  { size: 'M', chest: '44.5"', length: '28.5"', shoulder: '21.5"', fitNote: '5\'8" – 5\'10"' },
  { size: 'L', chest: '47.0"', length: '29.5"', shoulder: '22.5"', fitNote: '5\'10" – 6\'1"' },
  { size: 'XL', chest: '49.5"', length: '30.5"', shoulder: '23.5"', fitNote: '6\'1" – 6\'3"' },
  { size: 'XXL', chest: '52.0"', length: '31.5"', shoulder: '24.5"', fitNote: '6\'3"+ / Extra Boxy' },
];

export const CourtAndCircleSection: React.FC<CourtAndCircleSectionProps> = ({
  vipPromoCode,
  vipDiscountPercent,
  onApplyVipCode,
}) => {
  const [nickname, setNickname] = useState('');
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [preferredSize, setPreferredSize] = useState<ApparelSize>('L');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [vipResult, setVipResult] = useState<{ code: string; alreadyJoined: boolean } | null>(null);

  const handleJoinCircle = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanName = nickname.trim();
    const cleanPhone = whatsappPhone.trim();

    if (cleanName.length < 2) {
      setErrorMsg('Enter your court nickname (at least 2 characters).');
      return;
    }
    if (!/^[6-9][0-9]{9}$/.test(cleanPhone)) {
      setErrorMsg('Enter a valid 10-digit Indian WhatsApp number.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await joinOurCircle({
        nickname: cleanName,
        whatsappPhone: cleanPhone,
        preferredSize,
        vipCode: vipPromoCode,
      });
      setVipResult({ code: res.vipCode, alreadyJoined: res.alreadyJoined });
      onApplyVipCode?.(res.vipCode);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to join right now.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* THE COURT: Minimal Editorial Lookbook & Oversized Size Chart */}
      <section id="the-court" className="py-16 sm:py-20 border-t border-neutral-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-12">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#e0531f]">
                The Court · Delhi Lookbook
              </p>
              <h2 className="font-display text-4xl sm:text-5xl uppercase text-[#111111] mt-1">
                BUILT FOR CONCRETE &amp; CULTURE
              </h2>
            </div>
            <p className="text-sm text-neutral-600 max-w-md">
              Field-tested on Indian outdoor asphalt, heritage stone, and late-night transit.
              Heavyweight fabrics engineered with boxy drop-shoulder geometry.
            </p>
          </div>

          {/* Lookbook Mosaic */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {LOOKBOOK_SHOTS.map((shot) => (
              <figure
                key={shot.id}
                className="bg-white border border-neutral-200 rounded-lg overflow-hidden group"
              >
                <div className="aspect-[4/3] overflow-hidden bg-[#f7f7f7]">
                  <img
                    src={shot.src}
                    alt={shot.caption}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                </div>
                <figcaption className="p-3.5 flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-[#111111] truncate">{shot.caption}</span>
                  <span className="text-neutral-500 shrink-0">{shot.location}</span>
                </figcaption>
              </figure>
            ))}
          </div>

          {/* Oversized Size Chart */}
          <div
            id="size-chart"
            className="bg-[#f8f8f8] border border-neutral-200 rounded-xl p-6 sm:p-8"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-5">
              <div>
                <h3 className="font-display text-2xl sm:text-3xl uppercase text-[#111111]">
                  OVERSIZED COURT FIT CHART
                </h3>
                <p className="text-xs text-neutral-600">
                  Measurements in inches (garment laid flat). Size down for a closer athletic cut.
                </p>
              </div>
              <span className="text-xs font-bold uppercase tracking-wider text-[#e0531f]">
                Pre-Shrunk · Boxy Drape
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm tabular-nums">
                <thead>
                  <tr className="border-b border-neutral-200 text-xs uppercase tracking-wider text-neutral-500">
                    <th className="py-3 pr-4">Size</th>
                    <th className="py-3 px-4">Chest</th>
                    <th className="py-3 px-4">Length</th>
                    <th className="py-3 px-4">Shoulder</th>
                    <th className="py-3 pl-4">Recommended Height</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200/80">
                  {SIZE_CHART_ROWS.map((row) => (
                    <tr key={row.size} className="hover:bg-white transition-colors">
                      <td className="py-3 pr-4 font-bold text-[#e0531f]">{row.size}</td>
                      <td className="py-3 px-4 text-[#111111]">{row.chest}</td>
                      <td className="py-3 px-4 text-[#111111]">{row.length}</td>
                      <td className="py-3 px-4 text-[#111111]">{row.shoulder}</td>
                      <td className="py-3 pl-4 text-neutral-600">{row.fitNote}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* OUR CIRCLE: VIP Community & Instant Promo Unlock */}
      <section
        id="our-circle"
        className="py-16 sm:py-20 border-t border-neutral-200 bg-[#f7f7f7]"
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="bg-white border border-neutral-200 rounded-xl p-6 sm:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center shadow-sm">
            <div className="lg:col-span-6 space-y-3">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#e0531f]">
                Our Circle · VIP Roster
              </p>
              <h2 className="font-display text-4xl sm:text-5xl uppercase text-[#111111] leading-[0.96]">
                GET FIRST ACCESS TO LIMITED DROPS
              </h2>
              <p className="text-sm text-neutral-600 leading-relaxed">
                Join the Saucy Culture WhatsApp roster for early drop links, secret pickup-game
                invitations, and an instant{' '}
                <strong className="text-[#111111]">{vipDiscountPercent}% OFF</strong> code for
                today&apos;s bag.
              </p>
            </div>

            <div className="lg:col-span-6">
              {vipResult ? (
                <div className="bg-neutral-50 border border-[#e0531f] rounded-lg p-6 space-y-3">
                  <div className="flex items-center gap-2 text-emerald-700 text-sm font-bold uppercase tracking-wider">
                    <Check className="w-4 h-4" />
                    {vipResult.alreadyJoined
                      ? 'Already on the VIP Roster'
                      : 'Welcome to Our Circle'}
                  </div>
                  <p className="text-xs text-neutral-600">
                    Use this code at checkout for {vipDiscountPercent}% off your drop:
                  </p>
                  <div className="flex items-center justify-between bg-white border border-neutral-200 rounded px-4 py-3">
                    <span className="font-display text-2xl tracking-wider text-[#111111]">
                      {vipResult.code}
                    </span>
                    <span className="text-xs font-bold text-[#e0531f] inline-flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5" />
                      Auto-Applied
                    </span>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleJoinCircle} className="space-y-3.5">
                  <div>
                    <label
                      htmlFor="circle-nickname"
                      className="block text-xs font-bold uppercase tracking-wider text-neutral-700 mb-1"
                    >
                      Court Nickname
                    </label>
                    <input
                      id="circle-nickname"
                      type="text"
                      required
                      maxLength={50}
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      placeholder="e.g. Kabir / Bucket99"
                      className="w-full px-3.5 py-2.5 rounded bg-neutral-50 border border-neutral-300 focus:border-[#111111] focus:bg-white focus:outline-none text-sm text-[#111111]"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label
                        htmlFor="circle-whatsapp"
                        className="block text-xs font-bold uppercase tracking-wider text-neutral-700 mb-1"
                      >
                        WhatsApp Number
                      </label>
                      <input
                        id="circle-whatsapp"
                        type="tel"
                        required
                        maxLength={10}
                        value={whatsappPhone}
                        onChange={(e) =>
                          setWhatsappPhone(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))
                        }
                        placeholder="9876543210"
                        className="w-full px-3.5 py-2.5 rounded bg-neutral-50 border border-neutral-300 focus:border-[#111111] focus:bg-white focus:outline-none text-sm text-[#111111] tabular-nums"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="circle-size"
                        className="block text-xs font-bold uppercase tracking-wider text-neutral-700 mb-1"
                      >
                        Fit Size
                      </label>
                      <select
                        id="circle-size"
                        value={preferredSize}
                        onChange={(e) => setPreferredSize(e.target.value as ApparelSize)}
                        className="w-full px-3 py-2.5 rounded bg-neutral-50 border border-neutral-300 focus:border-[#111111] focus:bg-white focus:outline-none text-sm text-[#111111]"
                      >
                        {APPAREL_SIZES.map((sz) => (
                          <option key={sz} value={sz}>
                            {sz}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {errorMsg && <p className="text-xs text-red-600 font-medium">{errorMsg}</p>}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3 px-5 rounded bg-[#111111] hover:bg-[#e0531f] disabled:opacity-60 text-white text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    {submitting ? 'Registering...' : `Join Our Circle & Unlock ${vipPromoCode}`}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
};
