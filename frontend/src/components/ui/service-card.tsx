import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";

// CVA for card variants
const cardVariants = cva(
  "relative flex flex-col justify-between w-full p-6 overflow-hidden rounded-2xl shadow-sm transition-shadow duration-300 ease-in-out group hover:shadow-xl border border-[#ffffff15]",
  {
    variants: {
      variant: {
        default: "bg-[#0F2942] text-white",
        navy: "bg-gradient-to-br from-[#0F2942] via-[#153859] to-[#1e4e7a] text-white",
        emerald: "bg-gradient-to-br from-[#163a24] via-[#2E5B37] to-[#1e4228] text-white",
        amber: "bg-gradient-to-br from-[#7C2D12] via-[#9A3412] to-[#0F2942] text-white",
        purple: "bg-gradient-to-br from-[#2D1B4E] via-[#1E1B4B] to-[#0F2942] text-white",
        blue: "bg-gradient-to-br from-[#1E3A8A] via-[#1D4ED8] to-[#1e4e7a] text-white",
        red: "bg-gradient-to-br from-[#991B1B] via-[#DC2626] to-[#7F1D1D] text-white",
        gray: "bg-gradient-to-br from-[#1F2937] via-[#374151] to-[#111827] text-white",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface ServiceCardProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onAnimationStart' | 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onDragOver'>,
    VariantProps<typeof cardVariants> {
  /**
   * The main title of the card.
   */
  title: string;
  /**
   * Optional description text.
   */
  description?: string;
  /**
   * Optional URL or link text.
   */
  href?: string;
  /**
   * Text for action link.
   */
  actionText?: string;
  /**
   * Decorative image URL.
   */
  imgSrc?: string;
  /**
   * Alt text for decorative image.
   */
  imgAlt?: string;
  /**
   * Custom React Icon.
   */
  icon?: React.ReactNode;
  /**
   * Top badge label.
   */
  badge?: string;
}

const ServiceCard = React.forwardRef<HTMLDivElement, ServiceCardProps>(
  ({ className, variant, title, description, href, actionText, imgSrc, imgAlt = "", icon, badge, ...props }, ref) => {
    
    // Animation variants for Framer Motion
    const cardAnimation = {
      hover: {
        scale: 1.02,
        transition: { duration: 0.3 },
      },
    };

    const imageAnimation = {
      hover: {
        scale: 1.1,
        rotate: 3,
        x: 10,
        transition: { duration: 0.4, ease: "easeInOut" as const },
      },
    };
    
    const arrowAnimation = {
        hover: {
            x: 5,
            transition: { duration: 0.3, ease: "easeInOut" as const, repeat: Infinity, repeatType: "reverse" as const },
        }
    }

    return (
      <motion.div
        className={cn(cardVariants({ variant, className }))}
        ref={ref}
        variants={cardAnimation}
        whileHover="hover"
        {...props}
      >
        {/* Glow effect background */}
        <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition duration-300" />

        <div className="relative z-10 flex flex-col h-full justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              {icon && (
                <div className="p-2.5 rounded-xl bg-white/10 backdrop-blur-md w-fit border border-white/10 text-white">
                  {icon}
                </div>
              )}
              {badge && (
                <span className="text-[10px] font-extrabold uppercase tracking-wider bg-white/20 backdrop-blur-md px-2.5 py-0.5 rounded-full border border-white/20 text-white">
                  {badge}
                </span>
              )}
            </div>

            <h3 className="text-base font-bold tracking-tight text-white">{title}</h3>
            {description && (
              <p className="text-xs text-white/80 mt-1.5 leading-relaxed font-normal">{description}</p>
            )}
          </div>
          
          {href && (
            <a
              href={href}
              aria-label={`${actionText || 'Saber mais'} sobre ${title}`}
              className="mt-4 inline-flex items-center text-xs font-semibold uppercase tracking-wider text-white/90 group-hover:text-white group-hover:underline"
            >
              {actionText || "SABER MAIS"}
              <motion.div variants={arrowAnimation}>
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </motion.div>
            </a>
          )}
        </div>
        
        {imgSrc && (
          <motion.img
            src={imgSrc}
            alt={imgAlt}
            className="absolute -right-6 -bottom-6 w-36 h-36 object-contain opacity-80 group-hover:opacity-100 pointer-events-none"
            variants={imageAnimation}
          />
        )}
      </motion.div>
    );
  }
);
ServiceCard.displayName = "ServiceCard";

export { ServiceCard };
