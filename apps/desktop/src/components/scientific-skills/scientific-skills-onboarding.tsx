import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  FlaskConicalIcon,
  UploadIcon,
  AlertCircleIcon,
  SearchIcon,
  XIcon,
  RefreshCwIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  type SkillCategoryData,
  type SkillEntryData,
} from "./skill-category-card";
import { SkillCard } from "./skill-card";

const STORAGE_KEY = "scientific-skills-installed";
const MARKETPLACE_DISPLAY_COUNT = 5;

interface SkillInfo {
  id: string;
  name: string;
  domain: string;
  description: string;
  folder: string;
}

interface SkillsStatus {
  installed: boolean;
  skill_count: number;
  location: string;
}

interface ScientificSkillsOnboardingProps {
  onClose: () => void;
}

/** Pick n random items from an array (Fisher-Yates shuffle, then slice). */
function pickRandom<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, n);
}

export function ScientificSkillsOnboarding({
  onClose,
}: ScientificSkillsOnboardingProps) {
  const [categories, setCategories] = useState<SkillCategoryData[]>([]);
  const [installedSkills, setInstalledSkills] = useState<SkillInfo[]>([]);
  const [status, setStatus] = useState<SkillsStatus | null>(null);
  const [activeTab, setActiveTab] = useState<string>("marketplace");
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [randomSeed, setRandomSeed] = useState(0);

  // Track which skills are installed by folder name
  const installedFolders = new Set(installedSkills.map((s) => s.folder));

  // Flatten all skills from all categories
  const allSkills: SkillEntryData[] = useMemo(
    () => categories.flatMap((c) => c.skills),
    [categories],
  );

  // Pick 5 random skills for marketplace display (re-picks when randomSeed changes)
  const randomSkills: SkillEntryData[] = useMemo(
    () => pickRandom(allSkills, MARKETPLACE_DISPLAY_COUNT),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allSkills, randomSeed],
  );

  // Check global install status
  const checkStatus = useCallback(async () => {
    try {
      const gs = await invoke<SkillsStatus>("check_skills_installed", {
        projectPath: null,
      });
      setStatus(gs);
    } catch {
      setStatus(null);
    }
  }, []);

  // Load installed skills list
  const loadInstalledSkills = useCallback(async () => {
    try {
      const skills = await invoke<SkillInfo[]>("list_installed_skills", {
        projectPath: null,
      });
      setInstalledSkills(skills);
      if (skills.length > 0) {
        localStorage.setItem(STORAGE_KEY, "true");
      }
    } catch {
      setInstalledSkills([]);
    }
  }, []);

  useEffect(() => {
    checkStatus();
    loadInstalledSkills();
  }, [checkStatus, loadInstalledSkills]);

  useEffect(() => {
    invoke<SkillCategoryData[]>("get_skill_categories")
      .then((cats) => {
        setCategories(cats);
      })
      .catch(console.error);
  }, []);

  // Install a single skill
  const handleInstallSkill = useCallback(
    async (folder: string) => {
      setError(null);
      try {
        await invoke("install_single_skill", { skillFolder: folder });
        await loadInstalledSkills();
        await checkStatus();
      } catch (e) {
        setError(String(e));
      }
    },
    [loadInstalledSkills, checkStatus],
  );

  // Uninstall a single skill
  const handleUninstallSkill = useCallback(
    async (folder: string) => {
      setError(null);
      try {
        await invoke("uninstall_single_skill", { skillFolder: folder });
        await loadInstalledSkills();
        await checkStatus();
      } catch (e) {
        setError(String(e));
      }
    },
    [loadInstalledSkills, checkStatus],
  );

  // Upload skill — supports both folder and zip file
  const handleUpload = useCallback(async () => {
    const result = await openDialog({
      directory: false,
      multiple: false,
      title: "Select Skill (Folder or Zip)",
      filters: [
        { name: "Zip Archives", extensions: ["zip"] },
        { name: "All Files", extensions: ["*"] },
      ],
    });
    if (!result) {
      // User cancelled file dialog — try folder dialog instead
      const folderResult = await openDialog({
        directory: true,
        multiple: false,
        title: "Select Skill Folder",
      });
      if (!folderResult) return;
      const path =
        typeof folderResult === "string" ? folderResult : folderResult;
      setError(null);
      try {
        await invoke("upload_skill_folder", { sourcePath: path });
        await loadInstalledSkills();
        await checkStatus();
      } catch (e) {
        setError(String(e));
      }
      return;
    }

    const path = typeof result === "string" ? result : result;
    setError(null);
    try {
      if (path.toLowerCase().endsWith(".zip")) {
        await invoke("upload_skill_zip", { zipPath: path });
      } else {
        await invoke("upload_skill_folder", { sourcePath: path });
      }
      await loadInstalledSkills();
      await checkStatus();
    } catch (e) {
      setError(String(e));
    }
  }, [loadInstalledSkills, checkStatus]);

  // Filter installed skills by search
  const filteredInstalled = installedSkills.filter(
    (s) =>
      !searchQuery ||
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.folder.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Filter marketplace skills by search (only within the 5 displayed)
  const filteredMarketplace = searchQuery
    ? randomSkills.filter(
        (s) =>
          s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.folder.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : randomSkills;

  // ─── Render ───
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex h-[min(38rem,calc(100vh-4rem))] w-[min(48rem,calc(100vw-4rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
      >
        {/* Header */}
        <DialogHeader className="shrink-0 border-border border-b px-6 py-3">
          <div className="flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-sm">Skills Marketplace</DialogTitle>
              <DialogDescription className="mt-0.5 text-xs">
                {status?.installed
                  ? `${status.skill_count} installed`
                  : "No skills installed yet"}
              </DialogDescription>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleUpload}
                className="gap-1.5"
              >
                <UploadIcon className="size-3.5" />
                Upload
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="size-7 p-0"
              >
                <XIcon className="size-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Error banner */}
        {error && (
          <div className="flex items-start gap-2 border-border border-b bg-destructive/5 px-6 py-2">
            <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0 text-destructive" />
            <p className="min-w-0 flex-1 text-muted-foreground text-xs">
              {error}
            </p>
            <button
              onClick={() => setError(null)}
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              <XIcon className="size-3" />
            </button>
          </div>
        )}

        {/* Body — full width, no sidebar */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Tabs + Search */}
          <div className="flex shrink-0 items-center gap-3 border-border border-b px-4 py-2">
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="flex-1"
            >
              <TabsList className="h-7">
                <TabsTrigger value="marketplace" className="h-6 px-3 text-xs">
                  Marketplace
                </TabsTrigger>
                <TabsTrigger value="installed" className="h-6 px-3 text-xs">
                  Installed
                  {installedSkills.length > 0 && (
                    <Badge
                      variant="secondary"
                      className="ml-1.5 h-4 px-1 text-[10px]"
                    >
                      {installedSkills.length}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative w-48">
              <SearchIcon className="absolute top-1/2 left-2 size-3 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search skills..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-7 pl-7 text-xs"
              />
            </div>
          </div>

          {/* Tab content */}
          <ScrollArea className="flex-1">
            <div className="p-4">
              {activeTab === "marketplace" ? (
                <MarketplaceContent
                  skills={filteredMarketplace}
                  installedFolders={installedFolders}
                  onInstall={handleInstallSkill}
                  onUninstall={handleUninstallSkill}
                  onShuffle={() => setRandomSeed((s) => s + 1)}
                  isSearching={!!searchQuery}
                />
              ) : (
                <InstalledContent
                  skills={filteredInstalled}
                  onUninstall={handleUninstallSkill}
                  searchQuery={searchQuery}
                />
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between border-border border-t bg-muted/20 px-6 py-2">
          <p className="font-mono text-[11px] text-muted-foreground/60">
            {status?.location || "~/.claude/skills/"}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Marketplace Tab Content ───

function MarketplaceContent({
  skills,
  installedFolders,
  onInstall,
  onUninstall,
  onShuffle,
  isSearching,
}: {
  skills: SkillEntryData[];
  installedFolders: Set<string>;
  onInstall: (folder: string) => Promise<void>;
  onUninstall: (folder: string) => Promise<void>;
  onShuffle: () => void;
  isSearching: boolean;
}) {
  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-medium text-sm">
            {isSearching ? "Search Results" : "Discover Skills"}
          </h3>
          {isSearching && (
            <p className="text-muted-foreground text-xs">
              {skills.length} skills found
            </p>
          )}
        </div>
        {!isSearching && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onShuffle}
            className="gap-1.5 text-muted-foreground text-xs"
          >
            <RefreshCwIcon className="size-3" />
            Shuffle
          </Button>
        )}
      </div>

      {/* Skills grid */}
      {skills.length === 0 ? (
        <div className="flex h-24 items-center justify-center text-muted-foreground text-xs">
          No skills match your search
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {skills.map((skill) => (
            <SkillCard
              key={skill.folder}
              name={skill.name}
              folder={skill.folder}
              installed={installedFolders.has(skill.folder)}
              onInstall={() => onInstall(skill.folder)}
              onUninstall={() => onUninstall(skill.folder)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Installed Tab Content ───

function InstalledContent({
  skills,
  onUninstall,
  searchQuery,
}: {
  skills: SkillInfo[];
  onUninstall: (folder: string) => Promise<void>;
  searchQuery: string;
}) {
  if (skills.length === 0 && !searchQuery) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <FlaskConicalIcon className="size-6 text-muted-foreground" />
        </div>
        <div className="text-center">
          <p className="font-medium text-sm">No skills installed</p>
          <p className="mt-1 text-muted-foreground text-xs">
            Browse the Marketplace tab to install skills
          </p>
        </div>
      </div>
    );
  }

  if (skills.length === 0 && searchQuery) {
    return (
      <div className="flex h-24 items-center justify-center text-muted-foreground text-xs">
        No installed skills match "{searchQuery}"
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
      {skills.map((skill) => (
        <SkillCard
          key={skill.folder}
          name={skill.name}
          folder={skill.folder}
          description={skill.description}
          installed
          onUninstall={() => onUninstall(skill.folder)}
        />
      ))}
    </div>
  );
}

// ─── Helpers ───

export function shouldShowOnboarding(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== "true";
}

export function resetOnboardingFlag(): void {
  localStorage.removeItem(STORAGE_KEY);
}
