import { motion } from "framer-motion";

export default function LemmyMascot({ className = "" }: { className?: string }) {
  return (
    <motion.div 
      className={`relative inline-block ${className}`}
      animate={{ 
        y: [0, -20, 0],
        rotate: [0, 5, -5, 0]
      }}
      transition={{ 
        duration: 4, 
        repeat: Infinity,
        ease: "easeInOut" 
      }}
    >
      <svg 
        xmlns="http://www.w3.org/2000/svg" 
        viewBox="1 -2 24 24" 
        fill="none" 
        stroke="#F5F0FF" 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        className="w-full h-full shadow-[0_0_60px_rgba(157,96,255,0.8)]"
        style={{ 
          background: "#9D60FF", 
          borderRadius: "20%", 
          padding: "10%" 
        }}
      >
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 1 1-7.6-14h1.4c2 0 4 2 4 4v2"/>
        <path d="M9 11l.01 0"/>
        <path d="M15 11l.01 0"/>
      </svg>
      {/* Glitch/Shadow Effects */}
      <motion.div 
        className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-3/4 h-8 bg-black/40 blur-xl rounded-full"
        animate={{ scale: [1, 0.8, 1], opacity: [0.5, 0.2, 0.5] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />
    </motion.div>
  );
}
