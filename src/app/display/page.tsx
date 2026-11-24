"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

interface SlideshowPhoto {
  id: string;
  visitorId: string;
  imageUrl: string;
  status: string;
  playCount: number;
  createdAt: string;
  visitor: {
    name: string;
    createdAt: string;
  };
  isReturningVisitor: boolean;
}

interface SlideshowApiResponse {
  photos: SlideshowPhoto[];
  slideDurationSeconds: number;
}

export default function SmartTVSlideshowPage() {
  const [photos, setPhotos] = useState<SlideshowPhoto[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [slideDuration, setSlideDuration] = useState(8);
  const [progress, setProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const photosRef = useRef<SlideshowPhoto[]>([]);
  const currentIndexRef = useRef(currentIndex);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  // Poll slideshow queue from backend
  const fetchSlideshow = useCallback(async () => {
    try {
      const res = await fetch("/api/slideshow?limit=25");
      if (!res.ok) return;
      const data: SlideshowApiResponse = await res.json();

      if (data.photos) {
        if (data.slideDurationSeconds) {
          setSlideDuration(data.slideDurationSeconds);
        }

        setPhotos((prev) => {
          // If previous queue was empty and new photos arrived, reset index to 0
          if (prev.length === 0 && data.photos.length > 0) {
            setCurrentIndex(0);
            setProgress(0);
          }
          return data.photos;
        });
      }
    } catch (err) {
      console.error("Failed to poll slideshow queue:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch and 5s polling interval
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSlideshow();
    }, 0);
    const pollInterval = setInterval(fetchSlideshow, 5000);
    return () => {
      clearTimeout(timer);
      clearInterval(pollInterval);
    };
  }, [fetchSlideshow]);

  // Acknowledge slide playback on backend
  const acknowledgePhoto = async (photoId: string) => {
    try {
      await fetch("/api/slideshow/ack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoId }),
      });
    } catch (err) {
      console.error("Failed to ack photo playback:", err);
    }
  };

  // Next Slide Action
  const nextSlide = useCallback(() => {
    const currentList = photosRef.current;
    if (currentList.length === 0) return;

    const currentPhoto = currentList[currentIndexRef.current];
    if (currentPhoto) {
      // Mark as PLAYED
      acknowledgePhoto(currentPhoto.id);
    }

    setCurrentIndex((prev) => (prev + 1) % currentList.length);
    setProgress(0);
  }, []);

  // Previous Slide Action
  const prevSlide = useCallback(() => {
    const currentList = photosRef.current;
    if (currentList.length === 0) return;
    setCurrentIndex((prev) => (prev - 1 + currentList.length) % currentList.length);
    setProgress(0);
  }, []);

  // Timer loop for active slide progression
  useEffect(() => {
    if (photos.length === 0 || isPaused) return;

    const stepMs = 50; // 20 updates per second for smooth progress bar
    const totalMs = slideDuration * 1000;
    const increment = (stepMs / totalMs) * 100;

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          nextSlide();
          return 0;
        }
        return prev + increment;
      });
    }, stepMs);

    return () => clearInterval(timer);
  }, [photos.length, slideDuration, isPaused, nextSlide]);

  // Preload next image to eliminate lag
  useEffect(() => {
    if (photos.length > 1) {
      const nextIdx = (currentIndex + 1) % photos.length;
      const nextImgUrl = photos[nextIdx]?.imageUrl;
      if (nextImgUrl) {
        const img = new Image();
        img.src = nextImgUrl;
      }
    }
  }, [photos, currentIndex]);

  // Auto-hide controls on mouse inactivity
  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3500);
  };

  // Fullscreen toggle handler
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        nextSlide();
      } else if (e.key === "ArrowLeft") {
        prevSlide();
      } else if (e.key === "f" || e.key === "F") {
        toggleFullscreen();
      } else if (e.key === "p" || e.key === "P") {
        setIsPaused((p) => !p);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nextSlide, prevSlide]);

  const currentPhoto = photos[currentIndex];

  return (
    <div
      onMouseMove={handleMouseMove}
      className="relative w-screen h-screen overflow-hidden bg-[#1F1714] text-[#FAF6F0] select-none flex items-center justify-center font-sans"
    >
      {/* ---------------- 1. AMBIENT BLURRED BACKDROP ---------------- */}
      {currentPhoto && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={`ambient-${currentPhoto.id}`}
            src={currentPhoto.imageUrl}
            alt="Ambient backdrop"
            className="w-full h-full object-cover blur-3xl opacity-25 scale-125 transition-opacity duration-1000 ease-in-out"
          />
          {/* Vignette Overlay for rich gallery wall mood */}
          <div className="absolute inset-0 bg-radial from-transparent via-[#1F1714]/70 to-[#1F1714]" />
        </div>
      )}

      {/* ---------------- 2. EMPTY EXHIBIT STATE ---------------- */}
      {!isLoading && photos.length === 0 && (
        <div className="relative z-10 max-w-md w-full mx-4 p-8 sm:p-10 bg-[#2C221E]/85 backdrop-blur-md border border-[#FAF6F0]/15 rounded-3xl text-center shadow-2xl animate-fade-in">
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-[#B85A3A]/20 border border-[#B85A3A]/40 text-[#B85A3A] flex items-center justify-center">
            <svg
              className="w-8 h-8"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>

          <span className="text-xs font-semibold tracking-widest text-[#B85A3A] uppercase block mb-1">
            Exhibition Live Feed
          </span>
          <h2 className="text-3xl font-serif font-bold text-[#FAF6F0] mb-3">
            The Gallery Awaits
          </h2>
          <p className="text-sm text-[#FAF6F0]/70 leading-relaxed mb-6">
            Waiting for visitors to check in... Photographs uploaded through the
            check-in screen will appear here automatically.
          </p>

          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#B85A3A] hover:bg-[#9E4A2E] text-white text-sm font-semibold transition shadow-md active:scale-95"
          >
            <span>Open Visitor Check-In Form</span>
            <span>→</span>
          </Link>
        </div>
      )}

      {/* ---------------- 3. MAIN FRAMED ARTWORK DISPLAY ---------------- */}
      {currentPhoto && (
        <div className="relative z-10 flex flex-col items-center justify-center w-full h-full p-4 sm:p-12">
          {/* Framed Canvas Presentation */}
          <div className="relative max-w-[85vw] max-h-[82vh] p-3 sm:p-5 bg-[#16100E] border-4 sm:border-8 border-[#2C221E] rounded-xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85)] flex items-center justify-center transition-all duration-700 ease-out">
            {/* Inner Matte Bevel */}
            <div className="relative overflow-hidden rounded-md border border-[#E2D7C7]/20 bg-black/40 flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={currentPhoto.id}
                src={currentPhoto.imageUrl}
                alt={`Photo shared by ${currentPhoto.visitor.name}`}
                className="max-h-[72vh] max-w-[78vw] object-contain rounded-sm transition-opacity duration-700 animate-fade-in"
              />
            </div>
          </div>

          {/* ---------------- 4. GALLERY PLAQUE CAPTION OVERLAY ---------------- */}
          <div className="absolute bottom-6 left-6 sm:bottom-10 sm:left-10 z-20 max-w-sm sm:max-w-md bg-[#2C221E]/85 backdrop-blur-md border border-[#FAF6F0]/15 rounded-2xl p-5 sm:p-6 shadow-2xl transition-all duration-300">
            {/* Category / Exhibit Tag */}
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <span className="text-[10px] sm:text-xs font-semibold tracking-widest text-[#B85A3A] uppercase">
                Gallery Exhibit • Featured Visitor
              </span>

              <span className="text-[11px] text-[#FAF6F0]/60 font-mono">
                {currentIndex + 1} / {photos.length}
              </span>
            </div>

            {/* Visitor Name (Large Editorial Serif) */}
            <h3 className="text-2xl sm:text-3xl lg:text-4xl font-serif font-bold text-[#FAF6F0] tracking-wide leading-tight">
              {currentPhoto.visitor.name}
            </h3>

            {/* Returning Visitor Pill Badge */}
            {currentPhoto.isReturningVisitor && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#B85A3A] text-white tracking-wider uppercase mt-2.5 shadow-sm">
                <span className="text-amber-200">★</span>
                <span>Welcome Back • Returning Visitor</span>
              </div>
            )}

            {/* Countdown Progress Bar */}
            <div className="mt-4 pt-3 border-t border-[#FAF6F0]/10 flex items-center gap-3">
              <div className="flex-1 h-1.5 bg-[#FAF6F0]/15 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#B85A3A] to-amber-500 rounded-full transition-all ease-linear"
                  style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                />
              </div>

              <span className="text-[10px] text-[#FAF6F0]/50 font-mono uppercase">
                {isPaused ? "Paused" : `${Math.ceil((slideDuration * (100 - progress)) / 100)}s`}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- 5. HOVER KIOSK / TV CONTROLS ---------------- */}
      <div
        className={`absolute top-6 right-6 z-30 flex items-center gap-2.5 transition-opacity duration-300 ${
          showControls ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      >
        <Link
          href="/"
          className="px-3.5 py-2 rounded-xl bg-[#2C221E]/80 backdrop-blur-md border border-[#FAF6F0]/15 hover:bg-[#B85A3A] text-[#FAF6F0] text-xs font-semibold transition shadow-lg flex items-center gap-1.5"
          title="Return to Check-In Form"
        >
          <span>← Check-In</span>
        </Link>

        {photos.length > 0 && (
          <>
            <button
              type="button"
              onClick={prevSlide}
              className="p-2 rounded-xl bg-[#2C221E]/80 backdrop-blur-md border border-[#FAF6F0]/15 hover:bg-[#B85A3A] text-[#FAF6F0] transition shadow-lg cursor-pointer"
              title="Previous photo (←)"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <button
              type="button"
              onClick={() => setIsPaused((p) => !p)}
              className="p-2 rounded-xl bg-[#2C221E]/80 backdrop-blur-md border border-[#FAF6F0]/15 hover:bg-[#B85A3A] text-[#FAF6F0] transition shadow-lg cursor-pointer"
              title={isPaused ? "Resume slideshow (P)" : "Pause slideshow (P)"}
            >
              {isPaused ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M6.3 2.841A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              )}
            </button>

            <button
              type="button"
              onClick={nextSlide}
              className="p-2 rounded-xl bg-[#2C221E]/80 backdrop-blur-md border border-[#FAF6F0]/15 hover:bg-[#B85A3A] text-[#FAF6F0] transition shadow-lg cursor-pointer"
              title="Next photo (→)"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </>
        )}

        <button
          type="button"
          onClick={toggleFullscreen}
          className="p-2 rounded-xl bg-[#2C221E]/80 backdrop-blur-md border border-[#FAF6F0]/15 hover:bg-[#B85A3A] text-[#FAF6F0] transition shadow-lg cursor-pointer"
          title="Toggle Fullscreen (F)"
        >
          {isFullscreen ? (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
