import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;

const base = (props: P) => ({
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  ...props,
});

export const IconLogo = (props: P) => (
  <svg viewBox="0 0 32 32" fill="none" aria-hidden {...props}>
    <path d="M16 2.5 27.7 9.2v13.6L16 29.5 4.3 22.8V9.2L16 2.5Z" stroke="#e8bd55" strokeWidth="1.6" />
    <path d="M16 7.5 23.4 11.8v8.4L16 24.5 8.6 20.2v-8.4L16 7.5Z" stroke="rgba(232,189,85,.35)" strokeWidth="1" />
    <circle cx="16" cy="16" r="4.2" fill="#e8bd55" />
    <path d="M4 16h7M21 16h7" stroke="#e8bd55" strokeWidth="1.2" strokeDasharray="2 2.4" />
  </svg>
);

export const IconScan = (props: P) => (
  <svg {...base(props)}>
    <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
    <path d="M4 12h16" strokeDasharray="3 2.6" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
  </svg>
);

export const IconGrid = (props: P) => (
  <svg {...base(props)}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
    <path d="M17 13.5v7M13.5 17h7" />
  </svg>
);

export const IconHistory = (props: P) => (
  <svg {...base(props)}>
    <path d="M4.5 12a7.5 7.5 0 1 1 2.2 5.3" />
    <path d="M4.5 12.3V8.6h3.7" />
    <path d="M12 8.5V12l2.8 1.8" />
  </svg>
);

export const IconWand = (props: P) => (
  <svg {...base(props)}>
    <path d="M5 19 15.5 8.5" />
    <path d="m14 4.5.6 1.9 1.9.6-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.6.6-1.9Z" fill="currentColor" stroke="none" />
    <path d="m19.5 10 .45 1.4 1.4.45-1.4.45-.45 1.4-.45-1.4-1.4-.45 1.4-.45.45-1.4Z" fill="currentColor" stroke="none" />
    <path d="m6.5 3.5.4 1.1 1.1.4-1.1.4-.4 1.1-.4-1.1-1.1-.4 1.1-.4.4-1.1Z" fill="currentColor" stroke="none" />
  </svg>
);

export const IconDatabase = (props: P) => (
  <svg {...base(props)}>
    <ellipse cx="12" cy="5.5" rx="7.5" ry="3" />
    <path d="M4.5 5.5v6c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3v-6" />
    <path d="M4.5 11.5v6c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3v-6" />
  </svg>
);

export const IconFile = (props: P) => (
  <svg {...base(props)}>
    <path d="M6 3.5h8L19 8.5v12H6v-17Z" />
    <path d="M14 3.5v5h5" />
    <path d="M9 12.5h6M9 15.5h6M9 9.5h2" />
  </svg>
);

export const IconReport = (props: P) => (
  <svg {...base(props)}>
    <path d="M6 3.5h8L19 8.5V20a.9.9 0 0 1-.9.9H6a.9.9 0 0 1-.9-.9V4.4a.9.9 0 0 1 .9-.9Z" />
    <path d="M14 3.5v5h5" />
    <circle cx="12" cy="13.5" r="2.6" />
    <path d="m10.9 13.5.8.8 1.5-1.6" />
    <path d="M12 16.1v1.9M10.2 15.4l-.9 1.6M13.8 15.4l.9 1.6" />
  </svg>
);

export const IconChart = (props: P) => (
  <svg {...base(props)}>
    <path d="M4 4v16h16" />
    <path d="M8 16v-5M12 16V7M16 16v-8" />
  </svg>
);

export const IconSettings = (props: P) => (
  <svg {...base(props)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M18 6l-1.6 1.6M7.6 16.4 6 18M18 18l-1.6-1.6M7.6 7.6 6 6" />
  </svg>
);

export const IconBell = (props: P) => (
  <svg {...base(props)}>
    <path d="M6 10a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6Z" />
    <path d="M10 19a2 2 0 0 0 4 0" />
  </svg>
);

export const IconChevron = (props: P) => (
  <svg {...base(props)}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export const IconShield = (props: P) => (
  <svg {...base(props)}>
    <path d="M12 3 5 5.8v5.4c0 4.6 3 7.9 7 9.3 4-1.4 7-4.7 7-9.3V5.8L12 3Z" />
    <path d="M12 8.2v4.2M10 10.3h4" />
  </svg>
);

export const IconChip = (props: P) => (
  <svg {...base(props)}>
    <rect x="7" y="7" width="10" height="10" rx="1.6" />
    <rect x="10.4" y="10.4" width="3.2" height="3.2" />
    <path d="M9.5 3.5V7M14.5 3.5V7M9.5 17v3.5M14.5 17v3.5M3.5 9.5H7M3.5 14.5H7M17 9.5h3.5M17 14.5h3.5" />
  </svg>
);

export const IconScale = (props: P) => (
  <svg {...base(props)}>
    <path d="M12 4v16M8 20h8" />
    <path d="M5 7h14" />
    <path d="M7 7 4.5 12.5a2.6 2.6 0 0 0 5 0L7 7ZM17 7l-2.5 5.5a2.6 2.6 0 0 0 5 0L17 7Z" />
  </svg>
);

export const IconHeadset = (props: P) => (
  <svg {...base(props)}>
    <path d="M4.5 13.5v-2a7.5 7.5 0 0 1 15 0v2" />
    <rect x="3.5" y="13" width="4" height="6" rx="1.6" />
    <rect x="16.5" y="13" width="4" height="6" rx="1.6" />
    <path d="M19.5 19v.5a2 2 0 0 1-2 2H13" />
  </svg>
);

export const IconCloudUp = (props: P) => (
  <svg {...base(props)}>
    <path d="M7 18.5a4.5 4.5 0 0 1-.4-9A6 6 0 0 1 18.3 11a3.8 3.8 0 0 1-.8 7.5H7Z" />
    <path d="M12 16.5v-5M9.8 13.6 12 11.4l2.2 2.2" />
  </svg>
);

export const IconCheck = (props: P) => (
  <svg {...base(props)}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);

export const IconClose = (props: P) => (
  <svg {...base(props)}>
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
);

export const IconEye = (props: P) => (
  <svg {...base(props)}>
    <path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="2.8" />
  </svg>
);

export const IconArrow = (props: P) => (
  <svg {...base(props)}>
    <path d="M4 12h16M14 6l6 6-6 6" />
  </svg>
);

export const IconInfo = (props: P) => (
  <svg {...base(props)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5" />
    <circle cx="12" cy="8" r="0.9" fill="currentColor" stroke="none" />
  </svg>
);

export const IconLock = (props: P) => (
  <svg {...base(props)}>
    <rect x="5.5" y="10.5" width="13" height="9.5" rx="1.8" />
    <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    <path d="M12 14.2v2.3" />
  </svg>
);

export const IconDownload = (props: P) => (
  <svg {...base(props)}>
    <path d="M12 4v10M8 10.5l4 4 4-4" />
    <path d="M5 19.5h14" />
  </svg>
);

export const IconUpload = (props: P) => (
  <svg {...base(props)}>
    <path d="M12 14V4M8 7.5l4-4 4 4" />
    <path d="M5 19.5h14" />
  </svg>
);

export const IconRefresh = (props: P) => (
  <svg {...base(props)}>
    <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
    <path d="M19.5 3.5v3.7h-3.7" />
  </svg>
);

export const IconFlag = (props: P) => (
  <svg {...base(props)}>
    <path d="M6 21V4" />
    <path d="M6 4.8c2.5-1.6 5-1.6 7.5 0S18.5 6.4 20 5v8.5c-1.5 1.4-3.5 1.4-6.5 0s-5-1.6-7.5 0" />
  </svg>
);

export const IconFolder = (props: P) => (
  <svg {...base(props)}>
    <path d="M3.5 6.5a1.5 1.5 0 0 1 1.5-1.5h4l2 2.5h8a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18v-11.5Z" />
  </svg>
);

export const IconSearch = (props: P) => (
  <svg {...base(props)}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m15.5 15.5 5 5" />
  </svg>
);

export const IconTrash = (props: P) => (
  <svg {...base(props)}>
    <path d="M5 7h14M9.5 7V4.5h5V7M7 7l.8 12.5h8.4L17 7" />
    <path d="M10.2 10.5v6M13.8 10.5v6" />
  </svg>
);
