import type { Metadata, Viewport } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/contexts/LanguageContext";
import '@/lib/env'; // validate required env vars on cold-start

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
        {/* Prevent flash of wrong theme / accent / font-size / colors on load */}
        <script dangerouslySetInnerHTML={{ __html: `try{
var r=document.documentElement;
var g=function(k){try{var v=localStorage.getItem(k);return v?JSON.parse(v):null}catch(e){return null}};
var t=g('studysync_theme')||localStorage.getItem('theme');
if(t==='light')r.setAttribute('data-theme','light');
var AC={'Blue':['#2563eb','#3b82f6','rgba(37,99,235,0.14)'],'Purple':['#7c3aed','#8b5cf6','rgba(124,58,237,0.14)'],'Green':['#059669','#10b981','rgba(5,150,105,0.14)'],'Orange':['#d97706','#f59e0b','rgba(217,119,6,0.14)'],'Pink':['#db2777','#ec4899','rgba(219,39,119,0.14)']};
var ac=g('studysync_accent_color');
if(ac&&AC[ac]){r.style.setProperty('--accent',AC[ac][0]);r.style.setProperty('--accent-hover',AC[ac][1]);r.style.setProperty('--accent-muted',AC[ac][2]);r.style.setProperty('--violet',AC[ac][0]);r.style.setProperty('--violet-muted',AC[ac][2]);}
else if(ac&&ac.startsWith('#')){var rgb=function(h){return[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)]};var c=rgb(ac);var lt='rgb('+(Math.min(255,Math.round(c[0]+(255-c[0])*.18)))+','+(Math.min(255,Math.round(c[1]+(255-c[1])*.18)))+','+(Math.min(255,Math.round(c[2]+(255-c[2])*.18)))+')';r.style.setProperty('--accent',ac);r.style.setProperty('--accent-hover',lt);r.style.setProperty('--accent-muted','rgba('+c[0]+','+c[1]+','+c[2]+',.14)');r.style.setProperty('--violet',ac);r.style.setProperty('--violet-muted','rgba('+c[0]+','+c[1]+','+c[2]+',.14)');}
var fs=g('studysync_font_size');
if(fs==='small')document.body&&(document.body.style.fontSize='11px');
if(fs==='large')document.body&&(document.body.style.fontSize='16px');
var bc=g('studysync_bg_color');
if(bc)r.style.setProperty('--bg-app',bc);
var sc=g('studysync_sidebar_color');
if(sc){r.style.setProperty('--bg-panel',sc);r.style.setProperty('--bg-sidebar',sc);}
var FF={'default':"'Geist','Inter',system-ui,sans-serif",'serif':"Georgia,'Times New Roman',serif",'mono':"'JetBrains Mono','Fira Code',Consolas,monospace"};
var ff=g('studysync_font_family');
if(ff&&FF[ff])r.style.setProperty('--font-body',FF[ff]);
}catch(e){}` }} />
        {/* Geist — primary UI font */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
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
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
