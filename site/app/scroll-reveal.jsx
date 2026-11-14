"use client";

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

export default function ScrollReveal() {
  const pathname = usePathname();
  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reducedMotion.matches || !('IntersectionObserver' in window)) return;

    const targets = Array.from(document.querySelectorAll(
      '.intro, .experience, .receive-image, .receive-copy, .closing, .mobile-about, .mobile-gallery-head, .mobile-gallery figure, .mobile-hero-photo'
    ));
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.remove('reveal-pending');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.04, rootMargin: '0px 0px -6% 0px' });

    targets.forEach((target) => {
      // Keep the initial viewport visible and progressively enhance lower sections.
      if (target.getBoundingClientRect().top >= window.innerHeight) {
        target.classList.add('reveal-pending');
        observer.observe(target);
      }
    });

    const showAll = () => {
      if (reducedMotion.matches) {
        targets.forEach((target) => target.classList.remove('reveal-pending'));
        observer.disconnect();
      }
    };
    reducedMotion.addEventListener('change', showAll);
    return () => {
      reducedMotion.removeEventListener('change', showAll);
      observer.disconnect();
      targets.forEach((target) => target.classList.remove('reveal-pending'));
    };
  }, [pathname]);
  return null;
}
