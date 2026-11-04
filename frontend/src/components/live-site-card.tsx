import { cn } from "cn";
import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { CompressionSaving } from "@/components/compression-saving";
import { stageSize } from "@/components/folder-drop";
import { SiteAddress } from "@/components/site-address";
import { SitePreview } from "@/components/site-preview";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { siteUrl } from "@/lib/format";
import { useUpload } from "@/lib/upload";

const MotionCardContent = motion.create(CardContent);

// The live page's sections rise in one after another
const stagger = { shown: { transition: { staggerChildren: 0.08 } } };
const rise = {
  hidden: { opacity: 0, y: 12, filter: "blur(4px)" },
  shown: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.4, ease: "easeOut" as const },
  },
};

export function LiveSiteCard() {
  const { session, target, startOver } = useUpload();
  const reduceMotion = useReducedMotion();
  if (!session) return null;

  const slug = session.deployment.slug;
  const url = siteUrl(slug);
  return (
    <Card className={cn(stageSize, "py-0")}>
      <MotionCardContent
        className="flex flex-1 flex-col gap-6 py-6 lg:px-8 lg:py-8"
        variants={stagger}
        initial={reduceMotion ? false : "hidden"}
        animate="shown"
      >
        <motion.div variants={rise} className="min-w-0 space-y-3">
          <h1 className="text-3xl font-semibold tracking-tighter text-balance sm:text-4xl">
            {target ? "It's updated." : "It's live."}{" "}
            <span className="text-muted-foreground">
              {target ? "Same address, new files." : "Share it with anyone."}
            </span>
          </h1>
          {/* The actions sit on the address's row, as what to do with it */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 lg:max-w-xl lg:flex-1">
              <SiteAddress slug={slug} />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {url && (
                <Button asChild>
                  <a href={url} target="_blank" rel="noreferrer">
                    <ExternalLink />
                    Open site
                  </a>
                </Button>
              )}
              <Button variant="outline" asChild>
                <Link to="/sites/$slug" params={{ slug }}>
                  Manage site
                </Link>
              </Button>
              <Button type="button" variant="ghost" onClick={startOver}>
                Publish another site
              </Button>
            </div>
          </div>
          {session.deployment.description && (
            <p className="text-sm break-words text-muted-foreground">
              {session.deployment.description}
            </p>
          )}
          {session.originalSize !== undefined && (
            <CompressionSaving
              original={session.originalSize}
              uploaded={session.deployment.total_size}
            />
          )}
        </motion.div>
        {url && (
          <motion.div variants={rise} className="flex min-h-0 flex-1 flex-col">
            <SitePreview url={url} fill />
          </motion.div>
        )}
      </MotionCardContent>
    </Card>
  );
}
