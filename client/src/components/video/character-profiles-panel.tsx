import { useState, useRef, useCallback, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus, X, Lock, Unlock, Loader2, AlertCircle, CheckCircle2,
  GripVertical, Users, Sparkles, Save, Search, Download,
  RefreshCw, Trash2, BookOpen
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { CharacterProfile } from "@shared/video-types";

interface CharacterProfilesPanelProps {
  projectId?: string;
  characters: CharacterProfile[];
  onCharactersChange: (characters: CharacterProfile[]) => void;
  narrationTextareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  onInsertCharacterName?: (name: string) => void;
}

export function CharacterProfilesPanel({
  projectId,
  characters,
  onCharactersChange,
  narrationTextareaRef,
  onInsertCharacterName,
}: CharacterProfilesPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isExpanded, setIsExpanded] = useState(characters.length > 0);
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [librarySearch, setLibrarySearch] = useState("");
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const isStandalone = !projectId;

  const saveCharactersMutation = useMutation({
    mutationFn: async (chars: CharacterProfile[]) => {
      if (isStandalone) return { success: true };
      const res = await fetch(`/api/universal-video/projects/${projectId}/characters`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ characters: chars }),
      });
      if (!res.ok) throw new Error("Failed to save characters");
      return res.json();
    },
    onSuccess: () => {
      if (!isStandalone) {
        queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Save Failed", description: err.message, variant: "destructive" });
    },
  });

  const generateReferenceMutation = useMutation({
    mutationFn: async (characterId: string) => {
      if (isStandalone) {
        const char = characters.find(c => c.id === characterId);
        if (!char) throw new Error("Character not found");
        const res = await fetch(`/api/universal-video/generate-character-reference`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            name: char.name,
            role: char.role,
            physicalDescription: char.physicalDescription,
            wardrobe: char.wardrobe,
            personalityNotes: char.personalityNotes,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to generate reference image");
        }
        return res.json();
      }
      const res = await fetch(`/api/universal-video/projects/${projectId}/characters/${characterId}/generate-reference`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to generate reference image");
      }
      return res.json();
    },
    onSuccess: (data, characterId) => {
      const updated = characters.map(c =>
        c.id === characterId
          ? { ...c, referenceImageUrl: data.referenceImageUrl, generationStatus: 'completed' as const, generationError: undefined }
          : c
      );
      onCharactersChange(updated);
      if (!isStandalone) {
        queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      }
      toast({ title: "Reference Image Generated", description: "Disney/Pixar style character reference is ready." });
    },
    onError: (err: Error, characterId) => {
      const updated = characters.map(c =>
        c.id === characterId
          ? { ...c, generationStatus: 'failed' as const, generationError: err.message }
          : c
      );
      onCharactersChange(updated);
    },
  });

  const lockCharacterMutation = useMutation({
    mutationFn: async (characterId: string) => {
      if (isStandalone) return { success: true };
      const res = await fetch(`/api/universal-video/projects/${projectId}/characters/${characterId}/lock`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to lock character");
      return res.json();
    },
    onSuccess: (_data, characterId) => {
      const updated = characters.map(c =>
        c.id === characterId ? { ...c, locked: true } : c
      );
      onCharactersChange(updated);
      if (!isStandalone) {
        queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      }
      toast({ title: "Character Locked", description: "This character's reference will be used for consistent visuals across scenes." });
    },
    onError: (err: Error) => {
      toast({ title: "Lock Failed", description: err.message, variant: "destructive" });
    },
  });

  const saveToLibraryMutation = useMutation({
    mutationFn: async (character: CharacterProfile) => {
      const res = await fetch(`/api/universal-video/character-library`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(character),
      });
      if (!res.ok) throw new Error("Failed to save to library");
      return res.json();
    },
    onSuccess: (_data, character) => {
      const updated = characters.map(c =>
        c.id === character.id ? { ...c, savedToLibrary: true } : c
      );
      onCharactersChange(updated);
      queryClient.invalidateQueries({ queryKey: ["character-library"] });
      toast({ title: "Saved to Library", description: `${character.name} is now available for other projects.` });
    },
    onError: (err: Error) => {
      toast({ title: "Save Failed", description: err.message, variant: "destructive" });
    },
  });

  const importFromLibraryMutation = useMutation({
    mutationFn: async (libraryCharacterId: number) => {
      if (isStandalone) {
        const libChars = libraryQuery.data || [];
        const libChar = libChars.find((lc: any) => lc.id === libraryCharacterId);
        if (!libChar) throw new Error("Character not found in library");
        return { character: libChar };
      }
      const res = await fetch(`/api/universal-video/projects/${projectId}/characters/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ libraryCharacterId }),
      });
      if (!res.ok) throw new Error("Failed to import character");
      return res.json();
    },
    onSuccess: (data) => {
      if (data.character) {
        const newChar: CharacterProfile = {
          id: `char_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          name: data.character.name || "",
          role: data.character.role || "",
          physicalDescription: data.character.physicalDescription || "",
          wardrobe: data.character.wardrobe || "",
          personalityNotes: data.character.personalityNotes || "",
          referenceImageUrl: data.character.referenceImageUrl || null,
          locked: !!data.character.referenceImageUrl,
          generationStatus: data.character.referenceImageUrl ? 'completed' : 'idle',
          sortOrder: characters.length,
          savedToLibrary: true,
        };
        const updated = [...characters, newChar];
        onCharactersChange(updated);
        if (!isStandalone) {
          saveCharactersMutation.mutate(updated);
        }
      }
      setShowLibraryModal(false);
      if (!isStandalone) {
        queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      }
      toast({ title: "Character Imported", description: "Character has been added to this project." });
    },
    onError: (err: Error) => {
      toast({ title: "Import Failed", description: err.message, variant: "destructive" });
    },
  });

  const libraryQuery = useQuery({
    queryKey: ["character-library"],
    queryFn: async () => {
      const res = await fetch(`/api/universal-video/character-library`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return data.characters || [];
    },
    enabled: showLibraryModal,
  });

  const deleteFromLibraryMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/universal-video/character-library/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["character-library"] });
      toast({ title: "Removed from Library" });
    },
  });

  const addCharacter = () => {
    if (characters.length >= 5) return;
    const newChar: CharacterProfile = {
      id: `char_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      name: "",
      role: "",
      physicalDescription: "",
      wardrobe: "",
      personalityNotes: "",
      referenceImageUrl: null,
      locked: false,
      generationStatus: "idle",
      sortOrder: characters.length,
    };
    const updated = [...characters, newChar];
    onCharactersChange(updated);
    if (!isStandalone) {
      saveCharactersMutation.mutate(updated);
    }
    if (!isExpanded) setIsExpanded(true);
  };

  const removeCharacter = (id: string) => {
    const char = characters.find(c => c.id === id);
    if (char?.locked) return;
    const updated = characters.filter(c => c.id !== id).map((c, i) => ({ ...c, sortOrder: i }));
    onCharactersChange(updated);
    if (!isStandalone) {
      saveCharactersMutation.mutate(updated);
    }
  };

  const updateCharacterField = (id: string, field: keyof CharacterProfile, value: any) => {
    const updated = characters.map(c =>
      c.id === id ? { ...c, [field]: value } : c
    );
    onCharactersChange(updated);
  };

  const saveCharacterChanges = useCallback((chars?: CharacterProfile[]) => {
    if (!isStandalone) {
      saveCharactersMutation.mutate(chars || characters);
    }
  }, [characters, isStandalone]);

  const handleGenerateReference = (characterId: string) => {
    const updated = characters.map(c =>
      c.id === characterId ? { ...c, generationStatus: 'generating' as const, generationError: undefined } : c
    );
    onCharactersChange(updated);
    generateReferenceMutation.mutate(characterId);
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }
    const updated = [...characters];
    const [removed] = updated.splice(draggedIndex, 1);
    updated.splice(dropIndex, 0, removed);
    const reordered = updated.map((c, i) => ({ ...c, sortOrder: i }));
    onCharactersChange(reordered);
    if (!isStandalone) {
      saveCharactersMutation.mutate(reordered);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const insertCharacterName = (name: string) => {
    if (onInsertCharacterName) {
      onInsertCharacterName(name);
      return;
    }
    if (!narrationTextareaRef?.current) return;
    const ta = narrationTextareaRef.current;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const val = ta.value;
    const newVal = val.substring(0, start) + name + val.substring(end);

    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 'value'
    )?.set;
    nativeInputValueSetter?.call(ta, newVal);
    ta.dispatchEvent(new Event('input', { bubbles: true }));

    setTimeout(() => {
      ta.focus();
      const newPos = start + name.length;
      ta.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const lockedCharacters = characters.filter(c => c.locked);
  const filteredLibrary = (libraryQuery.data || []).filter((lc: any) =>
    !librarySearch || lc.name?.toLowerCase().includes(librarySearch.toLowerCase())
  );

  return (
    <div className="rounded-xl border" style={{
      borderColor: "rgba(139,92,246,0.2)",
      background: "linear-gradient(135deg, rgba(139,92,246,0.05), rgba(99,102,241,0.03))",
      backdropFilter: "blur(12px)",
    }}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            Character Profiles
          </span>
          {characters.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/25">
              {characters.length}/5
            </span>
          )}
          {lockedCharacters.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-300 border border-green-500/25 flex items-center gap-0.5">
              <Lock className="w-2.5 h-2.5" /> {lockedCharacters.length} locked
            </span>
          )}
        </div>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {isExpanded ? "−" : "+"}
        </span>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-3">
          {lockedCharacters.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <span className="text-[10px] text-purple-300/60 self-center mr-1">Insert name:</span>
              {lockedCharacters.map(c => (
                <button
                  key={c.id}
                  onClick={() => insertCharacterName(c.name)}
                  className="text-[11px] px-2 py-0.5 rounded-full border transition-colors hover:bg-purple-500/15 cursor-pointer"
                  style={{
                    borderColor: "rgba(139,92,246,0.3)",
                    color: "rgb(167,139,250)",
                    backgroundColor: "rgba(139,92,246,0.08)",
                  }}
                  title={`Click to insert "${c.name}" at cursor position in narration`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}

          {characters.map((char, index) => (
            <div
              key={char.id}
              draggable={!char.locked}
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              className="rounded-lg border p-3 transition-all"
              style={{
                borderColor: dragOverIndex === index
                  ? "rgb(139,92,246)"
                  : char.locked
                  ? "rgba(34,197,94,0.3)"
                  : "var(--border-subtle)",
                backgroundColor: char.locked
                  ? "rgba(34,197,94,0.05)"
                  : draggedIndex === index
                  ? "rgba(139,92,246,0.1)"
                  : "rgba(0,0,0,0.2)",
                opacity: draggedIndex === index ? 0.5 : 1,
              }}
            >
              <div className="flex items-start gap-2">
                {!char.locked && (
                  <div className="cursor-grab mt-1" style={{ color: "var(--text-muted)" }}>
                    <GripVertical className="w-3.5 h-3.5" />
                  </div>
                )}

                <div className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border" style={{ borderColor: "var(--border-subtle)" }}>
                  {char.generationStatus === "generating" ? (
                    <div className="w-full h-full flex items-center justify-center bg-purple-500/10">
                      <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
                    </div>
                  ) : char.referenceImageUrl ? (
                    <img
                      src={char.referenceImageUrl}
                      alt={char.name || "Character"}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: "rgba(139,92,246,0.08)" }}>
                      <Users className="w-5 h-5 text-purple-400/40" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      placeholder="Character Name"
                      value={char.name}
                      onChange={(e) => updateCharacterField(char.id, "name", e.target.value)}
                      onBlur={() => saveCharacterChanges()}
                      disabled={char.locked}
                      className="text-sm font-medium bg-transparent border-none outline-none flex-1 min-w-0 disabled:opacity-70"
                      style={{ color: "var(--text-primary)" }}
                    />
                    {char.locked && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/25 flex items-center gap-0.5 flex-shrink-0">
                        <Lock className="w-2 h-2" /> Locked
                      </span>
                    )}
                    {!char.locked && (
                      <button
                        onClick={() => removeCharacter(char.id)}
                        className="p-0.5 rounded hover:bg-red-500/10 transition-colors flex-shrink-0"
                        title="Remove character"
                      >
                        <X className="w-3.5 h-3.5 text-red-400/60 hover:text-red-400" />
                      </button>
                    )}
                  </div>

                  <input
                    type="text"
                    placeholder="Role/Title (e.g., 'Farm owner, warm grandmother')"
                    value={char.role}
                    onChange={(e) => updateCharacterField(char.id, "role", e.target.value)}
                    onBlur={() => saveCharacterChanges()}
                    disabled={char.locked}
                    className="w-full text-xs bg-transparent border-none outline-none disabled:opacity-70"
                    style={{ color: "var(--text-secondary)" }}
                  />
                </div>
              </div>

              <div className="mt-2 space-y-1.5">
                <textarea
                  placeholder="Physical description (hair, eyes, skin tone, build, age, distinguishing features...)"
                  value={char.physicalDescription}
                  onChange={(e) => updateCharacterField(char.id, "physicalDescription", e.target.value)}
                  onBlur={() => saveCharacterChanges()}
                  disabled={char.locked}
                  rows={2}
                  className="w-full text-xs rounded-md border px-2 py-1.5 bg-transparent outline-none resize-none disabled:opacity-70"
                  style={{
                    borderColor: char.locked ? "rgba(34,197,94,0.15)" : "var(--border-subtle)",
                    color: "var(--text-primary)",
                  }}
                />

                <input
                  type="text"
                  placeholder="Wardrobe/Clothing style (e.g., 'Green flannel, denim overalls, straw hat')"
                  value={char.wardrobe}
                  onChange={(e) => updateCharacterField(char.id, "wardrobe", e.target.value)}
                  onBlur={() => saveCharacterChanges()}
                  disabled={char.locked}
                  className="w-full text-xs rounded-md border px-2 py-1.5 bg-transparent outline-none disabled:opacity-70"
                  style={{
                    borderColor: char.locked ? "rgba(34,197,94,0.15)" : "var(--border-subtle)",
                    color: "var(--text-primary)",
                  }}
                />

                <input
                  type="text"
                  placeholder="Personality/Expression notes (e.g., 'Kind smile, warm eyes, gentle demeanor')"
                  value={char.personalityNotes}
                  onChange={(e) => updateCharacterField(char.id, "personalityNotes", e.target.value)}
                  onBlur={() => saveCharacterChanges()}
                  disabled={char.locked}
                  className="w-full text-xs rounded-md border px-2 py-1.5 bg-transparent outline-none disabled:opacity-70"
                  style={{
                    borderColor: char.locked ? "rgba(34,197,94,0.15)" : "var(--border-subtle)",
                    color: "var(--text-primary)",
                  }}
                />
              </div>

              {char.generationStatus === "failed" && char.generationError && (
                <div className="mt-2 flex items-start gap-1.5 p-2 rounded-md bg-red-500/10 border border-red-500/20">
                  <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[11px] text-red-300">{char.generationError}</p>
                  </div>
                </div>
              )}

              <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                {!char.locked && !char.referenceImageUrl && char.generationStatus !== "generating" && (
                  <button
                    onClick={() => handleGenerateReference(char.id)}
                    disabled={!char.name || !char.physicalDescription || generateReferenceMutation.isPending}
                    className="text-[11px] px-2.5 py-1 rounded-md bg-purple-600 text-white font-medium flex items-center gap-1 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    title="Generates a Disney/Pixar 3D reference image that will be used to keep this character visually consistent across all scenes"
                  >
                    <Sparkles className="w-3 h-3" />
                    Generate Reference Image
                  </button>
                )}

                {!char.locked && char.generationStatus === "failed" && (
                  <button
                    onClick={() => handleGenerateReference(char.id)}
                    disabled={generateReferenceMutation.isPending}
                    className="text-[11px] px-2.5 py-1 rounded-md bg-orange-600 text-white font-medium flex items-center gap-1 hover:bg-orange-500 disabled:opacity-40 transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Try Again
                  </button>
                )}

                {!char.locked && char.referenceImageUrl && char.generationStatus === "completed" && (
                  <>
                    <button
                      onClick={() => handleGenerateReference(char.id)}
                      disabled={generateReferenceMutation.isPending}
                      className="text-[11px] px-2.5 py-1 rounded-md border font-medium flex items-center gap-1 hover:bg-purple-500/10 transition-colors"
                      style={{ borderColor: "rgba(139,92,246,0.3)", color: "rgb(167,139,250)" }}
                    >
                      <RefreshCw className="w-3 h-3" />
                      Re-generate
                    </button>
                    <button
                      onClick={() => lockCharacterMutation.mutate(char.id)}
                      disabled={lockCharacterMutation.isPending}
                      className="text-[11px] px-2.5 py-1 rounded-md bg-green-600 text-white font-medium flex items-center gap-1 hover:bg-green-500 disabled:opacity-50 transition-colors"
                    >
                      <Lock className="w-3 h-3" />
                      Approve & Lock
                    </button>
                  </>
                )}

                {char.locked && !char.savedToLibrary && (
                  <button
                    onClick={() => saveToLibraryMutation.mutate(char)}
                    disabled={saveToLibraryMutation.isPending}
                    className="text-[11px] px-2.5 py-1 rounded-md border font-medium flex items-center gap-1 hover:bg-blue-500/10 transition-colors"
                    style={{ borderColor: "rgba(59,130,246,0.3)", color: "rgb(96,165,250)" }}
                  >
                    <BookOpen className="w-3 h-3" />
                    {saveToLibraryMutation.isPending ? "Saving..." : "Save to Library"}
                  </button>
                )}

                {char.locked && char.savedToLibrary && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20 flex items-center gap-0.5">
                    <CheckCircle2 className="w-2.5 h-2.5" /> In Library
                  </span>
                )}
              </div>
            </div>
          ))}

          <div className="flex items-center gap-2">
            <button
              onClick={addCharacter}
              disabled={characters.length >= 5}
              className="text-[11px] px-3 py-1.5 rounded-md border border-dashed flex items-center gap-1.5 transition-colors hover:border-purple-500/40 hover:bg-purple-500/5 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}
            >
              <Plus className="w-3 h-3" />
              Add Character {characters.length >= 5 ? "(max 5)" : ""}
            </button>

            <button
              onClick={() => setShowLibraryModal(true)}
              disabled={characters.length >= 5}
              className="text-[11px] px-3 py-1.5 rounded-md border border-dashed flex items-center gap-1.5 transition-colors hover:border-blue-500/40 hover:bg-blue-500/5 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}
            >
              <Download className="w-3 h-3" />
              Import from Library
            </button>
          </div>
        </div>
      )}

      {showLibraryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowLibraryModal(false)}>
          <div
            className="w-full max-w-lg max-h-[80vh] rounded-xl border p-4 overflow-hidden flex flex-col"
            style={{
              backgroundColor: "var(--surface, #1a1a2e)",
              borderColor: "rgba(139,92,246,0.3)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
                <BookOpen className="w-4 h-4 text-purple-400" />
                Character Library
              </h3>
              <button onClick={() => setShowLibraryModal(false)} className="p-1 rounded hover:bg-white/10">
                <X className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
              </button>
            </div>

            <div className="relative mb-3">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
              <input
                type="text"
                placeholder="Search characters..."
                value={librarySearch}
                onChange={(e) => setLibrarySearch(e.target.value)}
                className="w-full text-xs rounded-md border pl-8 pr-3 py-2 bg-transparent outline-none"
                style={{ borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                autoFocus
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-2">
              {libraryQuery.isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-purple-400" />
                </div>
              ) : filteredLibrary.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="w-8 h-8 mx-auto mb-2 text-purple-400/30" />
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {librarySearch ? "No characters match your search" : "No saved characters yet"}
                  </p>
                  <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
                    Lock a character and click "Save to Library" to reuse across projects
                  </p>
                </div>
              ) : (
                filteredLibrary.map((lc: any) => (
                  <div
                    key={lc.id}
                    className="flex items-center gap-3 p-2.5 rounded-lg border transition-colors hover:border-purple-500/30"
                    style={{ borderColor: "var(--border-subtle)", backgroundColor: "rgba(0,0,0,0.2)" }}
                  >
                    <div className="w-12 h-12 rounded-lg overflow-hidden border flex-shrink-0" style={{ borderColor: "var(--border-subtle)" }}>
                      {lc.referenceImageUrl ? (
                        <img src={lc.referenceImageUrl} alt={lc.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-purple-500/10">
                          <Users className="w-4 h-4 text-purple-400/40" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>{lc.name}</p>
                      <p className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>{lc.role}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => importFromLibraryMutation.mutate(lc.id)}
                        disabled={characters.length >= 5 || importFromLibraryMutation.isPending}
                        className="text-[10px] px-2 py-1 rounded-md bg-purple-600 text-white font-medium hover:bg-purple-500 disabled:opacity-40 transition-colors"
                      >
                        Import
                      </button>
                      <button
                        onClick={() => deleteFromLibraryMutation.mutate(lc.id)}
                        disabled={deleteFromLibraryMutation.isPending}
                        className="p-1 rounded hover:bg-red-500/10 transition-colors"
                        title="Remove from library"
                      >
                        <Trash2 className="w-3 h-3 text-red-400/60" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
