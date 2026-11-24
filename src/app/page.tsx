"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

interface VisitorPhoto {
  id: string;
  imageUrl: string;
  status: string;
  playCount: number;
  createdAt: string;
}

interface VisitorDetails {
  id: string;
  name: string;
  contact: string;
  createdAt: string;
}

interface UploadResponse {
  success: boolean;
  isReturningVisitor?: boolean;
  visitor?: VisitorDetails;
  queuedPhotosCount?: number;
  error?: string;
}

interface SelectedPhoto {
  file: File;
  previewUrl: string;
}

const MAX_FILES = 3;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

export default function VisitorCheckInPage() {
  const [activeTab, setActiveTab] = useState<"checkin" | "manage">("checkin");

  // Check-In Form State
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [consent, setConsent] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<SelectedPhoto[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Manage Tab State
  const [manageContact, setManageContact] = useState("");
  const [isLoadingPhotos, setIsLoadingPhotos] = useState(false);
  const [visitorData, setVisitorData] = useState<{
    visitor: VisitorDetails | null;
    photos: VisitorPhoto[];
  } | null>(null);
  const [manageError, setManageError] = useState<string | null>(null);
  const [manageSuccess, setManageSuccess] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null); // "all" or photoId

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      selectedPhotos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
  }, [selectedPhotos]);

  // Handle files selection & client-side validation
  const handleFiles = (incomingFiles: FileList | File[]) => {
    setFileError(null);
    const filesArray = Array.from(incomingFiles);

    if (selectedPhotos.length + filesArray.length > MAX_FILES) {
      setFileError(`You can select at most ${MAX_FILES} photos.`);
      return;
    }

    const validatedPhotos: SelectedPhoto[] = [];
    for (const file of filesArray) {
      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        setFileError(`'${file.name}' is not supported. Use JPEG, PNG, or WebP.`);
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setFileError(
          `'${file.name}' exceeds the 5MB size limit (${(
            file.size /
            (1024 * 1024)
          ).toFixed(1)}MB).`
        );
        return;
      }
      validatedPhotos.push({
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }

    setSelectedPhotos((prev) => [...prev, ...validatedPhotos]);
  };

  const removeSelectedFile = (index: number) => {
    setSelectedPhotos((prev) => {
      const removed = prev[index];
      if (removed) {
        URL.revokeObjectURL(removed.previewUrl);
      }
      return prev.filter((_, i) => i !== index);
    });
    setFileError(null);
  };

  // Check-in submission
  const handleSubmitCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consent || selectedPhotos.length === 0 || !name.trim() || !contact.trim()) {
      return;
    }

    setIsSubmitting(true);
    setUploadResult(null);
    setFileError(null);

    try {
      const formData = new FormData();
      formData.append("name", name.trim());
      formData.append("contact", contact.trim());
      formData.append("consent", consent ? "true" : "false");
      selectedPhotos.forEach((item) => {
        formData.append("photos", item.file);
      });

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data: UploadResponse = await res.json();
      setUploadResult(data);

      if (data.success) {
        // Reset inputs on success while keeping confirmation visible
        setName("");
        setContact("");
        setConsent(false);
        selectedPhotos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
        setSelectedPhotos([]);
      }
    } catch {
      setUploadResult({
        success: false,
        error: "Network error occurred while submitting your photos. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Load photos for management
  const handleLoadPhotos = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!manageContact.trim()) return;

    setIsLoadingPhotos(true);
    setManageError(null);
    setManageSuccess(null);

    try {
      const res = await fetch(
        `/api/visitor/photos?contact=${encodeURIComponent(manageContact.trim())}`
      );
      const data = await res.json();

      if (data.success) {
        setVisitorData({
          visitor: data.visitor,
          photos: data.photos || [],
        });
        if (!data.visitor || data.photos.length === 0) {
          setManageError("No photos found associated with this email or phone number.");
        }
      } else {
        setManageError(data.error || "Failed to load photos.");
      }
    } catch {
      setManageError("Unable to connect to the gallery server.");
    } finally {
      setIsLoadingPhotos(false);
    }
  };

  // Delete single photo
  const handleDeletePhoto = async (photoId: string) => {
    if (!confirm("Are you sure you want to permanently remove this photo from the exhibit?")) {
      return;
    }

    setIsDeleting(photoId);
    setManageError(null);
    setManageSuccess(null);

    try {
      const res = await fetch("/api/visitor/photos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact: manageContact.trim(),
          photoId,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setManageSuccess("Photo removed permanently from the exhibition.");
        setVisitorData((prev) =>
          prev
            ? {
                ...prev,
                photos: prev.photos.filter((p) => p.id !== photoId),
              }
            : null
        );
      } else {
        setManageError(data.error || "Failed to delete photo.");
      }
    } catch {
      setManageError("Network error occurred during deletion.");
    } finally {
      setIsDeleting(null);
    }
  };

  // Delete all photos
  const handleDeleteAllPhotos = async () => {
    if (
      !confirm(
        "Are you sure you want to delete ALL your photos from the gallery exhibition? This action cannot be undone."
      )
    ) {
      return;
    }

    setIsDeleting("all");
    setManageError(null);
    setManageSuccess(null);

    try {
      const res = await fetch("/api/visitor/photos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact: manageContact.trim(),
        }),
      });

      const data = await res.json();
      if (data.success) {
        setManageSuccess(`All your photos have been completely erased from the gallery.`);
        setVisitorData((prev) =>
          prev
            ? {
                ...prev,
                photos: [],
              }
            : null
        );
      } else {
        setManageError(data.error || "Failed to delete photos.");
      }
    } catch {
      setManageError("Network error occurred during deletion.");
    } finally {
      setIsDeleting(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF6F0] text-[#2C221E] flex flex-col justify-between py-8 px-4 sm:px-6 selection:bg-[#B85A3A]/20">
      {/* Top Demo Testing Navigation Bar */}
      <header className="max-w-3xl mx-auto w-full flex items-center justify-between pb-6 border-b border-[#E2D7C7]/60">
        <div>
          <span className="text-xs font-semibold tracking-widest text-[#B85A3A] uppercase block">
            Exhibition Archive
          </span>
          <h1 className="text-xl sm:text-2xl font-serif font-bold text-[#2C221E]">
            Visitor Photo Gallery
          </h1>
        </div>

        <Link
          href="/display"
          target="_blank"
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium bg-[#2C221E] text-[#FAF6F0] hover:bg-[#B85A3A] transition shadow-sm"
          title="Open live exhibition slideshow for TV or demo preview"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
          <span>Open Smart TV Display</span>
          <span className="text-[#FAF6F0]/60">↗</span>
        </Link>
      </header>

      {/* Main Content Card */}
      <main className="max-w-lg w-full mx-auto my-8">
        <div className="bg-[#FFFFFF] border border-[#E2D7C7] rounded-2xl shadow-xl shadow-[#2C221E]/5 overflow-hidden transition-all">
          {/* Tab Switcher Header */}
          <div className="grid grid-cols-2 bg-[#F3ECE1]/70 border-b border-[#E2D7C7] p-1.5 gap-1 text-sm font-medium">
            <button
              type="button"
              onClick={() => setActiveTab("checkin")}
              className={`py-2.5 px-3 rounded-xl transition text-center cursor-pointer flex items-center justify-center gap-2 ${
                activeTab === "checkin"
                  ? "bg-[#FFFFFF] text-[#2C221E] font-semibold shadow-sm border border-[#E2D7C7]/50"
                  : "text-[#6B5B54] hover:text-[#2C221E] hover:bg-[#FFFFFF]/40"
              }`}
            >
              <svg
                className="w-4 h-4 text-[#B85A3A]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4v16m8-8H4"
                />
              </svg>
              <span>Check-In & Upload</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("manage")}
              className={`py-2.5 px-3 rounded-xl transition text-center cursor-pointer flex items-center justify-center gap-2 ${
                activeTab === "manage"
                  ? "bg-[#FFFFFF] text-[#2C221E] font-semibold shadow-sm border border-[#E2D7C7]/50"
                  : "text-[#6B5B54] hover:text-[#2C221E] hover:bg-[#FFFFFF]/40"
              }`}
            >
              <svg
                className="w-4 h-4 text-[#B85A3A]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              <span>Manage / Privacy</span>
            </button>
          </div>

          <div className="p-6 sm:p-8">
            {/* ---------------- TAB 1: CHECK-IN & UPLOAD ---------------- */}
            {activeTab === "checkin" && (
              <div>
                <div className="mb-6">
                  <h2 className="text-2xl font-serif font-bold text-[#2C221E]">
                    Share Your Moment
                  </h2>
                  <p className="text-sm text-[#6B5B54] mt-1">
                    Upload up to 3 photographs to be featured in the gallery’s public
                    smart TV slideshow.
                  </p>
                </div>

                {/* Upload Success / Returning Visitor Banner */}
                {uploadResult && (
                  <div
                    className={`mb-6 p-4 rounded-xl border text-sm transition animate-fade-in ${
                      uploadResult.success
                        ? "bg-[#FAF6F0] border-[#B85A3A]/40 text-[#2C221E]"
                        : "bg-[#FDF2F2] border-[#E08B8B] text-[#9E2A2B]"
                    }`}
                  >
                    {uploadResult.success ? (
                      <div>
                        <div className="flex items-center gap-2 font-bold text-[#B85A3A]">
                          <svg
                            className="w-5 h-5 flex-shrink-0"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                              clipRule="evenodd"
                            />
                          </svg>
                          <span>Photos Added to the Exhibit Queue!</span>
                        </div>

                        {uploadResult.isReturningVisitor ? (
                          <p className="mt-2 text-[#2C221E] leading-relaxed">
                            <strong className="text-[#B85A3A]">Welcome back!</strong> Your
                            previous photos have also been re-queued alongside your new
                            ones so your complete story plays on screen (
                            <strong>{uploadResult.queuedPhotosCount}</strong> photos
                            currently queued).
                          </p>
                        ) : (
                          <p className="mt-2 text-[#6B5B54]">
                            Welcome to the exhibit,{" "}
                            <strong>{uploadResult.visitor?.name}</strong>! Your photos
                            are now queued and will rotate onto the screen shortly.
                          </p>
                        )}

                        <div className="mt-3 flex items-center gap-3">
                          <Link
                            href="/display"
                            target="_blank"
                            className="text-xs font-semibold text-[#B85A3A] hover:underline"
                          >
                            Watch Smart TV Display →
                          </Link>
                          <span className="text-[#E2D7C7]">•</span>
                          <button
                            type="button"
                            onClick={() => setUploadResult(null)}
                            className="text-xs text-[#6B5B54] hover:text-[#2C221E]"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2">
                        <svg
                          className="w-5 h-5 text-[#9E2A2B] mt-0.5 flex-shrink-0"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                            clipRule="evenodd"
                          />
                        </svg>
                        <span>{uploadResult.error || "Submission error"}</span>
                      </div>
                    )}
                  </div>
                )}

                <form onSubmit={handleSubmitCheckIn} className="space-y-5">
                  {/* Visitor Name */}
                  <div>
                    <label
                      htmlFor="visitor-name"
                      className="block text-xs font-bold uppercase tracking-wider text-[#6B5B54] mb-1.5"
                    >
                      Full Name <span className="text-[#B85A3A]">*</span>
                    </label>
                    <input
                      id="visitor-name"
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Maya Lin"
                      className="w-full px-3.5 py-2.5 bg-[#FAF6F0]/60 border border-[#E2D7C7] rounded-xl text-[#2C221E] placeholder-[#6B5B54]/50 focus:outline-none focus:ring-2 focus:ring-[#B85A3A]/30 focus:border-[#B85A3A] transition text-sm"
                    />
                  </div>

                  {/* Phone or Email */}
                  <div>
                    <label
                      htmlFor="visitor-contact"
                      className="block text-xs font-bold uppercase tracking-wider text-[#6B5B54] mb-1.5"
                    >
                      Phone or Email <span className="text-[#B85A3A]">*</span>
                    </label>
                    <input
                      id="visitor-contact"
                      type="text"
                      required
                      value={contact}
                      onChange={(e) => setContact(e.target.value)}
                      placeholder="e.g. maya@gallery.org or +1 (555) 019-2834"
                      className="w-full px-3.5 py-2.5 bg-[#FAF6F0]/60 border border-[#E2D7C7] rounded-xl text-[#2C221E] placeholder-[#6B5B54]/50 focus:outline-none focus:ring-2 focus:ring-[#B85A3A]/30 focus:border-[#B85A3A] transition text-sm"
                    />
                    <p className="text-[11px] text-[#6B5B54] mt-1">
                      Enables returning visitor recognition and photo privacy controls.
                    </p>
                  </div>

                  {/* Drag and Drop Upload Area */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-[#6B5B54] mb-1.5">
                      Select Photos (1 to 3) <span className="text-[#B85A3A]">*</span>
                    </label>

                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragging(true);
                      }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDragging(false);
                        if (e.dataTransfer.files) {
                          handleFiles(e.dataTransfer.files);
                        }
                      }}
                      onClick={() => fileInputRef.current?.click()}
                      className={`relative border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition flex flex-col items-center justify-center ${
                        isDragging
                          ? "border-[#B85A3A] bg-[#B85A3A]/5 scale-[0.99]"
                          : "border-[#E2D7C7] bg-[#FAF6F0]/40 hover:bg-[#FAF6F0] hover:border-[#B85A3A]/60"
                      }`}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files) {
                            handleFiles(e.target.files);
                          }
                        }}
                      />

                      <div className="w-10 h-10 rounded-full bg-[#F3ECE1] text-[#B85A3A] flex items-center justify-center mb-2 shadow-inner">
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                      </div>

                      <p className="text-xs font-semibold text-[#2C221E]">
                        Drag & drop your photographs, or{" "}
                        <span className="text-[#B85A3A] underline">browse</span>
                      </p>
                      <p className="text-[11px] text-[#6B5B54] mt-0.5">
                        JPEG, PNG, or WebP • Up to 3 photos • Max 5MB each
                      </p>
                    </div>

                    {fileError && (
                      <p className="text-xs text-[#9E2A2B] font-medium mt-1.5 flex items-center gap-1">
                        <span>⚠</span>
                        <span>{fileError}</span>
                      </p>
                    )}
                  </div>

                  {/* Polaroid Photo Previews */}
                  {selectedPhotos.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-[#6B5B54]">
                          Selected Photos ({selectedPhotos.length} of {MAX_FILES})
                        </span>
                        {selectedPhotos.length < MAX_FILES && (
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="text-xs text-[#B85A3A] font-semibold hover:underline"
                          >
                            + Add another
                          </button>
                        )}
                      </div>

                      {/* Polaroid Gallery Grid */}
                      <div className="grid grid-cols-3 gap-3 pt-2 pb-3">
                        {selectedPhotos.map((photoItem, index) => {
                          // Subtle tilt angles for authentic Polaroid gallery aesthetic
                          const tilts = ["-rotate-2", "rotate-2", "-rotate-1"];
                          const tilt = tilts[index % tilts.length];

                          return (
                            <div
                              key={photoItem.previewUrl}
                              className={`group relative bg-white p-2 pb-4 shadow-md border border-[#E2D7C7] rounded-sm transform transition duration-200 hover:rotate-0 hover:scale-105 hover:shadow-xl ${tilt}`}
                            >
                              <div className="relative aspect-square w-full overflow-hidden bg-[#F3ECE1] rounded-[1px]">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={photoItem.previewUrl}
                                  alt={`Upload preview ${index + 1}`}
                                  className="w-full h-full object-cover"
                                />

                                {/* Remove Button */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeSelectedFile(index);
                                  }}
                                  className="absolute top-1 right-1 w-5 h-5 bg-[#2C221E]/80 hover:bg-[#B85A3A] text-white rounded-full flex items-center justify-center transition shadow-sm text-xs"
                                  title="Remove photo"
                                >
                                  ×
                                </button>
                              </div>

                              {/* Polaroid Caption Label */}
                              <div className="mt-2 text-center">
                                <span className="block text-[10px] text-[#6B5B54] truncate px-1">
                                  {photoItem.file.name}
                                </span>
                                <span className="text-[9px] text-[#6B5B54]/60">
                                  {(
                                    photoItem.file.size /
                                    (1024 * 1024)
                                  ).toFixed(1)}{" "}
                                  MB
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Privacy & Consent Checkbox */}
                  <div className="pt-2">
                    <label className="flex items-start gap-3 p-3 bg-[#FAF6F0] rounded-xl border border-[#E2D7C7]/80 cursor-pointer hover:bg-[#F3ECE1]/60 transition">
                      <input
                        type="checkbox"
                        required
                        checked={consent}
                        onChange={(e) => setConsent(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-[#E2D7C7] text-[#B85A3A] focus:ring-[#B85A3A] cursor-pointer"
                      />
                      <span className="text-xs text-[#2C221E] leading-relaxed">
                        I consent to displaying my photos publicly on the gallery
                        slideshow screen.
                        <span className="block text-[11px] text-[#6B5B54] mt-0.5">
                          You retain full ownership and can delete your photos at any
                          time using the Manage tab.
                        </span>
                      </span>
                    </label>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={
                      !consent ||
                      selectedPhotos.length === 0 ||
                      !name.trim() ||
                      !contact.trim() ||
                      isSubmitting
                    }
                    className={`w-full py-3 px-4 rounded-xl font-semibold text-sm transition shadow-md flex items-center justify-center gap-2 ${
                      !consent ||
                      selectedPhotos.length === 0 ||
                      !name.trim() ||
                      !contact.trim() ||
                      isSubmitting
                        ? "bg-[#E2D7C7] text-[#6B5B54]/60 cursor-not-allowed shadow-none"
                        : "bg-[#B85A3A] hover:bg-[#9E4A2E] text-white cursor-pointer active:scale-[0.99]"
                    }`}
                  >
                    {isSubmitting ? (
                      <>
                        <svg
                          className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8v8H4z"
                          />
                        </svg>
                        <span>Submitting to Exhibition...</span>
                      </>
                    ) : (
                      <>
                        <span>Add to Gallery Slideshow</span>
                        <span>→</span>
                      </>
                    )}
                  </button>
                </form>
              </div>
            )}

            {/* ---------------- TAB 2: MANAGE / PRIVACY ---------------- */}
            {activeTab === "manage" && (
              <div>
                <div className="mb-6">
                  <h2 className="text-2xl font-serif font-bold text-[#2C221E]">
                    Visitor Privacy Controls
                  </h2>
                  <p className="text-sm text-[#6B5B54] mt-1">
                    Enter the phone number or email you used at check-in to review or
                    permanently delete your photos from the exhibit.
                  </p>
                </div>

                {/* Search Form */}
                <form onSubmit={handleLoadPhotos} className="flex gap-2 mb-6">
                  <input
                    type="text"
                    required
                    value={manageContact}
                    onChange={(e) => setManageContact(e.target.value)}
                    placeholder="Enter phone or email"
                    className="flex-1 px-3.5 py-2.5 bg-[#FAF6F0]/60 border border-[#E2D7C7] rounded-xl text-[#2C221E] placeholder-[#6B5B54]/50 focus:outline-none focus:ring-2 focus:ring-[#B85A3A]/30 focus:border-[#B85A3A] transition text-sm"
                  />
                  <button
                    type="submit"
                    disabled={isLoadingPhotos || !manageContact.trim()}
                    className="px-4 py-2.5 rounded-xl bg-[#2C221E] hover:bg-[#B85A3A] text-white text-sm font-semibold transition disabled:opacity-50 cursor-pointer"
                  >
                    {isLoadingPhotos ? "Searching..." : "Find Photos"}
                  </button>
                </form>

                {/* Alerts */}
                {manageError && (
                  <div className="mb-5 p-3.5 rounded-xl bg-[#FDF2F2] border border-[#E08B8B] text-[#9E2A2B] text-xs flex items-center gap-2">
                    <span>⚠</span>
                    <span>{manageError}</span>
                  </div>
                )}

                {manageSuccess && (
                  <div className="mb-5 p-3.5 rounded-xl bg-[#FAF6F0] border border-[#B85A3A]/40 text-[#B85A3A] text-xs flex items-center gap-2">
                    <span>✓</span>
                    <span>{manageSuccess}</span>
                  </div>
                )}

                {/* Photo Management Grid */}
                {visitorData && visitorData.photos.length > 0 && (
                  <div className="space-y-4 animate-fade-in">
                    <div className="flex items-center justify-between pb-2 border-b border-[#E2D7C7]">
                      <div>
                        <h3 className="text-sm font-bold text-[#2C221E]">
                          {visitorData.visitor?.name}’s Photographs
                        </h3>
                        <p className="text-[11px] text-[#6B5B54]">
                          {visitorData.photos.length} photo
                          {visitorData.photos.length !== 1 ? "s" : ""} in exhibition
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={handleDeleteAllPhotos}
                        disabled={isDeleting !== null}
                        className="text-xs font-semibold text-[#9E2A2B] hover:text-[#9E2A2B]/80 hover:underline cursor-pointer disabled:opacity-50 flex items-center gap-1"
                      >
                        {isDeleting === "all" ? "Deleting..." : "Delete All Photos"}
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {visitorData.photos.map((photo) => (
                        <div
                          key={photo.id}
                          className="bg-[#FAF6F0] border border-[#E2D7C7] rounded-xl p-2 flex flex-col justify-between shadow-sm hover:shadow-md transition"
                        >
                          <div className="aspect-square w-full rounded-lg overflow-hidden bg-[#F3ECE1] mb-2 relative">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={photo.imageUrl}
                              alt="Exhibited photo"
                              className="w-full h-full object-cover"
                            />
                            <span
                              className={`absolute top-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-semibold tracking-wider uppercase ${
                                photo.status === "QUEUED"
                                  ? "bg-[#B85A3A] text-white"
                                  : "bg-[#2C221E]/80 text-[#FAF6F0]"
                              }`}
                            >
                              {photo.status}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-[11px] pt-1">
                            <span className="text-[#6B5B54]">
                              Plays: {photo.playCount}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDeletePhoto(photo.id)}
                              disabled={isDeleting !== null}
                              className="text-xs font-semibold text-[#9E2A2B] hover:underline cursor-pointer disabled:opacity-50"
                            >
                              {isDeleting === photo.id ? "Removing..." : "Remove"}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center text-xs text-[#6B5B54]/70 pt-6">
        <span>Museum & Event Photo Slideshow • Warm Editorial Gallery Theme</span>
      </footer>
    </div>
  );
}
