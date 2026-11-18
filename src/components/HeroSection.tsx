import React from 'react';
import { HERO_NIGHT_COURT_IMG, MASCOT_GORILLA_IMG } from '../data/catalog';

interface HeroSectionProps {
  heroTitle?: string;
  heroSubtitle?: string;
  onShopDrop: () => void;
  onExploreCourt: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  heroTitle,
  heroSubtitle,
  onShopDrop,
  onExploreCourt,
}) => {
  return (
    <section
      id="hero"
      className="relative overflow-hidden bg-[#0c0d10] min-h-[520px] lg:min-h-[590px] flex items-center"
    >
      {/* Full-bleed punchy streetball editorial photo without green camo borders */}
      <img
        src={HERO_NIGHT_COURT_IMG}
        alt="Saucy Culture Streetball Editorial"
        referrerPolicy="no-referrer"
        className="absolute inset-0 w-full h-full object-cover object-[center_22%] contrast-115 saturate-115 brightness-95"
      />

      {/* Crisp cinematic directional scrims & subtle warm ember court glow */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-r from-[#0a0a0c]/88 via-[#0a0a0c]/25 to-[#0a0a0c]/92"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-[#0a0a0c]/90 via-transparent to-[#0a0a0c]/40"
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-24 left-1/2 -translate-x-1/2 w-[780px] h-[260px] rounded-full bg-[#e0531f]/20 blur-3xl pointer-events-none"
      />

      {/* Main Hero Content Grid */}
      <div className="relative z-10 max-w-7xl mx-auto w-full px-5 sm:px-8 lg:px-12 py-16 lg:py-24 grid grid-cols-1 lg:grid-cols-12 items-center gap-10">
        {/* Left Punchy Brand Anchor */}
        <div className="lg:col-span-6 flex flex-col items-start">
          <img
            src={MASCOT_GORILLA_IMG}
            alt="Saucy Culture Crest"
            referrerPolicy="no-referrer"
            className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl object-cover border-2 border-[#e0531f] shadow-[0_12px_32px_rgba(224,83,31,0.4)] bg-[#0c0d10] mb-4"
          />

          <div className="select-none">
            <span className="block font-graffiti text-5xl sm:text-6xl lg:text-7xl text-white leading-[0.94] drop-shadow-[0_6px_0_#e0531f]">
              SAUCY
            </span>
            <span className="block font-graffiti text-5xl sm:text-6xl lg:text-7xl text-white leading-[0.98] drop-shadow-[0_6px_0_rgba(0,0,0,0.95)] mt-1">
              CULTURE
            </span>
          </div>
        </div>

        {/* Right High-Impact Campaign Focal Point */}
        <div className="lg:col-span-6 lg:text-right flex flex-col lg:items-end">
          <h1
            className="font-display text-5xl sm:text-6xl lg:text-[78px] uppercase text-white leading-[0.92] tracking-wide max-w-lg lg:ml-auto drop-shadow-[0_10px_28px_rgba(0,0,0,0.65)]"
            style={{ textWrap: 'balance' }}
          >
            {heroTitle?.trim() || 'THE NEW HOOP ERA'}
          </h1>

          <p className="mt-4 text-xs sm:text-sm font-bold uppercase tracking-[0.18em] text-neutral-200">
            {heroSubtitle?.trim() || 'BASKETBALL × STREETWEAR · ALL-STAR DROP'}
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3.5 lg:justify-end">
            <button
              type="button"
              onClick={onShopDrop}
              className="px-7 py-3.5 bg-[#e0531f] hover:bg-[#c84617] text-white text-xs sm:text-sm font-bold uppercase tracking-wider rounded transition-all shadow-[0_10px_24px_rgba(224,83,31,0.35)] whitespace-nowrap shrink-0 cursor-pointer"
            >
              Shop the Drop
            </button>
            <button
              type="button"
              onClick={onExploreCourt}
              className="px-7 py-3.5 bg-white hover:bg-neutral-100 text-[#111111] text-xs sm:text-sm font-bold uppercase tracking-wider rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Explore the Court
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
