import React from 'react';
import { AuctionItem } from '@/types';
import { MapPin, Star } from 'lucide-react';

interface MapPlaceholderProps {
  items: AuctionItem[];
}

export const MapPlaceholder: React.FC<MapPlaceholderProps> = ({ items }) => {
  // Generate random positions for visualization purposes only
  // deterministic based on ID char codes to be stable
  const getPosition = (id: string) => {
    const sum = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const top = (sum % 80) + 10; // 10% to 90%
    const left = ((sum * 13) % 80) + 10;
    return { top: `${top}%`, left: `${left}%` };
  };

  return (
    <div className="relative h-full w-full bg-[#1a1b1e] overflow-hidden">
      {/* Map Grid/Background Pattern */}
      <div className="absolute inset-0 opacity-10 pointer-events-none" 
           style={{ 
             backgroundImage: 'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)', 
             backgroundSize: '40px 40px' 
           }} 
      />
      
      {/* Map Content Overlay */}
      <div className="absolute inset-0 p-4">
        <div className="absolute top-4 right-4 z-10 rounded-md bg-black/80 px-3 py-2 text-xs text-gray-300 backdrop-blur-sm border border-gray-800">
           <span className="font-bold text-white">Canarias Area</span>
        </div>
      </div>

      {/* Pins */}
      {items.map((item) => {
        const pos = getPosition(item.id);
        
        let pinColor = "text-gray-500";
        let zIndex = 10;
        let Icon = MapPin;
        
        if (item.status === 'active') {
          pinColor = "text-green-500 drop-shadow-[0_0_8px_rgba(34,197,94,0.6)]";
          zIndex = 20;
        } else if (item.status === 'pre-auction') {
          pinColor = "text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]";
          zIndex = 30;
          Icon = Star; // Gold Star
        }

        return (
          <div 
            key={item.id}
            className={`absolute transform -translate-x-1/2 -translate-y-1/2 transition-all hover:scale-125 hover:z-50 cursor-pointer ${pinColor}`}
            style={{ ...pos, zIndex }}
            title={item.title}
          >
             <Icon className={`h-6 w-6 ${item.status === 'pre-auction' ? 'fill-current' : 'fill-current'}`} />
             {/* Pulse effect for active */}
             {item.status === 'active' && (
               <div className="absolute inset-0 -z-10 animate-ping rounded-full bg-green-500 opacity-30" />
             )}
          </div>
        );
      })}

      {/* Map Controls Mockup */}
      <div className="absolute bottom-6 right-6 flex flex-col gap-2">
         <div className="h-8 w-8 rounded bg-gray-800 flex items-center justify-center text-white hover:bg-gray-700 cursor-pointer">+</div>
         <div className="h-8 w-8 rounded bg-gray-800 flex items-center justify-center text-white hover:bg-gray-700 cursor-pointer">-</div>
      </div>
    </div>
  );
};
