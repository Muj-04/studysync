import type { Metadata, Viewport } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "StudySpace",
  description: "Your personal PDF study workspace — annotate, record, and focus.",
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

const BG =
  "https://i.pinimg.com/originals/d7/b9/0c/d7b90cc80898e8823455a127945719af.jpg";

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistMono.variable} h-full`}>
      <head>
        {/* Prevent flash of wrong theme / accent / font-size on load */}
        <script dangerouslySetInnerHTML={{ __html: `try{
var r=document.documentElement;
var t=localStorage.getItem('studysync_theme')||localStorage.getItem('theme');
if(t==='light')r.setAttribute('data-theme','light');
var AC={'Blue':['#2563eb','#3b82f6','rgba(37,99,235,0.14)'],'Purple':['#7c3aed','#8b5cf6','rgba(124,58,237,0.14)'],'Green':['#059669','#10b981','rgba(5,150,105,0.14)'],'Orange':['#d97706','#f59e0b','rgba(217,119,6,0.14)'],'Pink':['#db2777','#ec4899','rgba(219,39,119,0.14)']};
var ac=localStorage.getItem('studysync_accent_color');
if(ac&&AC[ac]){r.style.setProperty('--accent',AC[ac][0]);r.style.setProperty('--accent-hover',AC[ac][1]);r.style.setProperty('--accent-muted',AC[ac][2]);r.style.setProperty('--violet',AC[ac][0]);r.style.setProperty('--violet-muted',AC[ac][2]);}
var fs=localStorage.getItem('studysync_font_size');
if(fs==='small')document.body&&(document.body.style.fontSize='11px');
if(fs==='large')document.body&&(document.body.style.fontSize='16px');
}catch(e){}` }} />
        {/* Geist — primary UI font */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
        {/* Boxicons — used on login page */}
        <link
          rel="stylesheet"
          href="https://unpkg.com/boxicons@2.1.4/css/boxicons.min.css"
        />
      </head>
      <body className="min-h-full flex flex-col antialiased">
        {/* Brick-wall background — visible on login page only */}
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            inset: 0,
            backgroundImage: `url('${BG}')`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            zIndex: -2,
            pointerEvents: "none",
          }}
        />
        {/* Dark overlay — helps login glassmorphism pop */}
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.52)",
            zIndex: -1,
            pointerEvents: "none",
          }}
        />
        {children}
      </body>
    </html>
  );
}
