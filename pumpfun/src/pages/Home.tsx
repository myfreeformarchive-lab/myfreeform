import { useState } from "react";
import { motion } from "framer-motion";
import { Twitter, Send, Rocket, LineChart, Copy, Check } from "lucide-react";
import LemmyMascot from "@/components/LemmyMascot";

export default function Home() {
  const [copied, setCopied] = useState(false);
  const CA = "9KgZ7RbfJdUftzxcEmzg6Rz2AUsb8z8MsCVkScHHpump";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(CA);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy", err);
    }
  };

  const socials = [
    { name: "X (Twitter)", icon: Twitter, href: "https://x.com/myfreeform", color: "bg-black text-white hover:bg-zinc-800" },
    { name: "Telegram", icon: Send, href: "https://t.me/myfreeform_official", color: "bg-[#0088cc] text-white hover:bg-[#0077b5]" },
    { name: "Pump.fun", icon: Rocket, href: "https://pump.fun/coin/9KgZ7RbfJdUftzxcEmzg6Rz2AUsb8z8MsCVkScHHpump", color: "bg-meme-neon text-black hover:bg-green-400" },
    { name: "Dexscreener", icon: LineChart, href: "https://dexscreener.com/solana/bea4piif1tm3yzdpnwtczncyh1bf9k59gvu5epgf4a5o", color: "bg-meme-purple text-white hover:bg-purple-500" },
  ];

  return (
    <div className="min-h-screen bg-meme-dark text-meme-light font-russo overflow-hidden relative selection:bg-meme-neon selection:text-black">
      
      {/* Chaotic background elements */}
      <div className="fixed inset-0 pointer-events-none opacity-20">
        <div className="absolute top-[-20%] left-[-10%] w-96 h-96 bg-meme-purple rounded-full blur-[128px]"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-96 h-96 bg-meme-neon rounded-full blur-[128px]"></div>
      </div>

      <div className="fixed top-0 left-0 w-full h-full bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSIvPjwvc3ZnPg==')] pointer-events-none opacity-50 z-0"></div>

      {/* Marquee Header */}
      <div className="w-full bg-meme-neon text-black py-2 overflow-hidden whitespace-nowrap z-50 border-b-4 border-black relative shadow-[0_4px_0_0_#9D60FF]">
        <div className="flex animate-marquee font-bangers text-3xl tracking-widest uppercase">
          {[...Array(10)].map((_, i) => (
            <span key={i} className="mx-4">BUY $FORM 👻 HOLD LEMMY 🚀 MOON IMMINENT 💎</span>
          ))}
        </div>
      </div>

      <main className="relative z-10 container mx-auto px-4 py-12 flex flex-col items-center justify-center min-h-[calc(100vh-60px)]">
        
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 10, duration: 0.8 }}
          className="mb-8"
        >
          <LemmyMascot className="w-48 h-48 md:w-72 md:h-72" />
        </motion.div>

        <motion.div 
          className="text-center mb-12"
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <h1 className="font-bangers text-7xl md:text-9xl mb-2 text-transparent bg-clip-text bg-gradient-to-br from-meme-purple to-meme-light drop-shadow-[0_5px_5px_rgba(57,255,20,0.5)]">
            $FORM
          </h1>
          <p className="text-2xl md:text-4xl text-meme-neon mb-6 uppercase drop-shadow-[0_2px_2px_rgba(0,0,0,1)]">
            Lemmy The Ghost
          </p>
        </motion.div>

        {/* Contract Address Section */}
        <motion.div 
          className="w-full max-w-2xl mb-16"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5, type: "spring" }}
        >
          <div className="bg-black/50 backdrop-blur-md border-4 border-meme-purple p-6 rounded-3xl shadow-[0_0_40px_rgba(157,96,255,0.3)] transform hover:scale-[1.02] transition-transform duration-300">
            <h2 className="text-center text-xl md:text-2xl mb-4 text-meme-yellow font-bangers tracking-wider">
              CA (Contract Address)
            </h2>
            <div className="flex flex-col md:flex-row gap-4 items-center">
              <code className="flex-1 bg-black text-meme-neon p-4 rounded-xl text-sm md:text-lg break-all border-2 border-zinc-800 shadow-inner font-mono text-center w-full">
                {CA}
              </code>
              <motion.button
                whileHover={{ scale: 1.1, rotate: 5 }}
                whileTap={{ scale: 0.9 }}
                onClick={handleCopy}
                className="w-full md:w-auto flex items-center justify-center gap-2 bg-meme-purple hover:bg-purple-600 text-white font-bangers text-2xl px-8 py-4 rounded-xl border-4 border-black shadow-[4px_4px_0_0_#000] active:shadow-[0_0_0_0_#000] active:translate-y-1 transition-all"
              >
                {copied ? <Check className="w-6 h-6" /> : <Copy className="w-6 h-6" />}
                {copied ? "COPIED APE!" : "COPY CA"}
              </motion.button>
            </div>
          </div>
        </motion.div>

        {/* Social Links */}
        <motion.div 
          className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl mb-12"
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
        >
          {socials.map((social) => (
            <motion.a
              key={social.name}
              href={social.href}
              target="_blank"
              rel="noopener noreferrer"
              whileHover={{ scale: 1.05, y: -5 }}
              whileTap={{ scale: 0.95 }}
              className={`flex items-center justify-center gap-4 p-6 rounded-2xl border-4 border-black shadow-[6px_6px_0_0_#000] active:shadow-[0_0_0_0_#000] active:translate-y-1.5 transition-all group overflow-hidden relative ${social.color}`}
            >
              <div className="absolute inset-0 w-full h-full bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out z-0"></div>
              <social.icon className="w-8 h-8 md:w-10 md:h-10 z-10" />
              <span className="font-bangers text-3xl md:text-4xl tracking-widest z-10">
                {social.name}
              </span>
            </motion.a>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 1 }}
          className="text-center text-zinc-500 text-sm mt-8 pb-8 flex flex-col items-center gap-2"
        >
          <p>© {new Date().getFullYear()} $FORM. Not financial advice. Just a ghost.</p>
          <a 
            href="/app.html" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-[9px] text-zinc-500 hover:text-meme-purple transition-colors flex items-center gap-1 opacity-60 hover:opacity-100 font-sans tracking-widest uppercase mt-4"
          >
            back to app <span className="text-[7px]">↗</span>
          </a>
        </motion.div>
      </main>
    </div>
  );
}
