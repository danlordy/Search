"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Settings, RotateCcw, Plus, X, Zap, Upload, Sun, Moon, FolderOpen, LayoutGrid, Puzzle, UserCircle2, ChevronRight, Save, Trash2 } from "lucide-react";
import { useSettings, DEFAULT_SECTIONS, Section } from "@/hooks/use-settings";
import { useTheme } from "@/hooks/use-theme";
import { useToast } from "@/hooks/use-toast";
import { authClient } from "@/lib/auth/client";
import { getUserGrade, getUserRole } from "@/lib/auth/permissions";

type Theme = 'light' | 'dark' | 'system';
const SECTION_LOCAL_STORAGE_PREFIXES = ["search_history", "recent_history_panel_open"] as const;

export function SettingsDialog() {
  const { settings, updateSettings, resetSettings, isLoaded } = useSettings();
  const { theme, updateTheme } = useTheme();
  const [newPath, setNewPath] = useState("");
  const [appTitle, setAppTitle] = useState("FileFinder");
  const [appSubtitle, setAppSubtitle] = useState("Find your local files instantly");
  const [logoUrl, setLogoUrl] = useState("");
  const [showAppTitle, setShowAppTitle] = useState(true);
  const [showAppSubtitle, setShowAppSubtitle] = useState(true);
  const [useAbrirAdobe, setUseAbrirAdobe] = useState(false);
  const [fileExtensions, setFileExtensions] = useState<string[]>(['pdf', 'docx']);
  const [newExtension, setNewExtension] = useState("");
  const [selectedTheme, setSelectedTheme] = useState<Theme>('system');
  const [sections, setSections] = useState<Section[]>([]);
  const [baselineSectionIds, setBaselineSectionIds] = useState<string[]>([]);
  const [indexSectionId, setIndexSectionId] = useState("");
  const [duplicateFromSectionId, setDuplicateFromSectionId] = useState("");
  const [newSectionId, setNewSectionId] = useState("");
  const [newSectionLabel, setNewSectionLabel] = useState("");
  const [newSectionDescription, setNewSectionDescription] = useState("");
  const [open, setOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { data: sessionData } = authClient.useSession();

  const COMMON_EXTENSIONS = ['pdf', 'docx', 'xlsx', 'pptx', 'txt', 'doc', 'xls', 'ppt', 'jpg', 'png', 'zip', 'rar'];
  const activeIndexSection = sections.find((section) => section.id === indexSectionId) || sections[0];
  const activeIndexPaths = activeIndexSection?.indexPaths || [];
  const currentUserName =
    sessionData?.user?.name && typeof sessionData.user.name === "string"
      ? sessionData.user.name
      : "Usuario";
  const currentRole = getUserRole(sessionData?.user);
  const currentGrade = getUserGrade(sessionData?.user);

  const normalizeSectionId = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9-_]/g, '');
  const getNormalizedSectionIds = (rows: Section[]) =>
    Array.from(
      new Set(
        rows
          .map((section) => normalizeSectionId(section.id))
          .filter((sectionId) => sectionId.length > 0),
      ),
    );
  const clearRemovedSectionLocalStorage = (sectionIds: string[]) => {
    if (typeof window === "undefined" || sectionIds.length === 0) return;

    const uniqueIds = Array.from(new Set(sectionIds.filter((sectionId) => sectionId.length > 0)));
    uniqueIds.forEach((sectionId) => {
      SECTION_LOCAL_STORAGE_PREFIXES.forEach((prefix) => {
        try {
          localStorage.removeItem(`${prefix}:${sectionId}`);
        } catch (error) {
          console.error(`Failed to clear local storage for section ${sectionId}:`, error);
        }
      });
    });
  };

  const handleAddSection = () => {
    const id = normalizeSectionId(newSectionId);
    const label = newSectionLabel.trim();
    if (!id || !label) {
      toast({
        title: 'Error',
        description: 'La seccion necesita un ID y un nombre',
        variant: 'destructive',
      });
      return;
    }

    if (sections.some((section) => section.id === id)) {
      toast({
        title: 'Error',
        description: 'Ya existe una seccion con ese ID',
        variant: 'destructive',
      });
      return;
    }

    const newSection: Section = {
      id,
      label,
      description: newSectionDescription.trim(),
      documentsPath: `/data/documents-${id}.json`,
      statsPath: `/data/search-stats-${id}.json`,
      indexPaths: [],
    };

    setSections([...sections, newSection]);
    if (!indexSectionId) {
      setIndexSectionId(id);
    }
    setNewSectionId('');
    setNewSectionLabel('');
    setNewSectionDescription('');
  };

  const handleRemoveSection = (id: string) => {
    const updated = sections.filter((section) => section.id !== id);
    setSections(updated);
    if (indexSectionId === id) {
      setIndexSectionId(updated[0]?.id || "");
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validar que sea una imagen
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Error",
        description: "Por favor selecciona un archivo de imagen válido",
        variant: "destructive",
      });
      return;
    }

    // Validar tamaño (máximo 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: "Error",
        description: "El tamaño de la imagen debe ser menor a 2MB",
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64String = event.target?.result as string;
      setLogoUrl(base64String);
      toast({
        title: "Éxito",
        description: "Imagen cargada correctamente",
      });
    };
    reader.readAsDataURL(file);

    // Limpiar el input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveLogo = () => {
    setLogoUrl("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    toast({
      title: "Logo eliminado",
      description: "Guarda la configuración para aplicar los cambios",
    });
  };

  const handleAddPath = () => {
    if (!activeIndexSection) {
      toast({
        title: "Error",
        description: "Primero selecciona una sección para indexar",
        variant: "destructive",
      });
      return;
    }

    if (!newPath.trim()) {
      toast({
        title: "Error",
        description: "La ruta no puede estar vacía",
        variant: "destructive",
      });
      return;
    }

    if (activeIndexPaths.includes(newPath.trim())) {
      toast({
        title: "Error",
        description: "Esta ruta ya ha sido añadida",
        variant: "destructive",
      });
      return;
    }

    setSections(sections.map((section) =>
      section.id === activeIndexSection.id
        ? { ...section, indexPaths: [...activeIndexPaths, newPath.trim()] }
        : section
    ));
    setNewPath("");
  };

  const handleRemovePath = (pathToRemove: string) => {
    if (!activeIndexSection) return;
    setSections(sections.map((section) =>
      section.id === activeIndexSection.id
        ? { ...section, indexPaths: activeIndexPaths.filter(p => p !== pathToRemove) }
        : section
    ));
  };

  const handleAddExtension = (ext: string) => {
    const lowerExt = ext.toLowerCase().trim().replace(/^\./, '');
    if (!lowerExt) {
      toast({
        title: "Error",
        description: "La extensión no puede estar vacía",
        variant: "destructive",
      });
      return;
    }

    if (fileExtensions.includes(lowerExt)) {
      toast({
        title: "Error",
        description: "Esta extensión ya ha sido añadida",
        variant: "destructive",
      });
      return;
    }

    setFileExtensions([...fileExtensions, lowerExt]);
  };

  const handleRemoveExtension = (extToRemove: string) => {
    setFileExtensions(fileExtensions.filter(e => e !== extToRemove));
  };

  const handleDuplicatePaths = () => {
    if (!activeIndexSection) {
      toast({
        title: "Error",
        description: "Primero selecciona una sección para indexar",
        variant: "destructive",
      });
      return;
    }

    if (!duplicateFromSectionId) {
      toast({
        title: "Error",
        description: "Selecciona una sección origen",
        variant: "destructive",
      });
      return;
    }

    const source = sections.find((section) => section.id === duplicateFromSectionId);
    if (!source) {
      toast({
        title: "Error",
        description: "La sección origen no existe",
        variant: "destructive",
      });
      return;
    }

    const sourcePaths = source.indexPaths || [];
    const merged = Array.from(new Set([...(activeIndexSection.indexPaths || []), ...sourcePaths]));

    setSections(sections.map((section) =>
      section.id === activeIndexSection.id
        ? { ...section, indexPaths: merged }
        : section
    ));

    toast({
      title: "Listo",
      description: "Rutas duplicadas correctamente",
    });
  };

  const handleSave = async () => {
    const currentSectionIds = getNormalizedSectionIds(sections);
    const removedSectionIds = baselineSectionIds.filter(
      (sectionId) => !currentSectionIds.includes(sectionId),
    );

    try {
      await updateSettings({
        indexPaths: settings.indexPaths || [],
        appTitle: appTitle.trim() || 'Buscador de Archivos',
        appSubtitle: appSubtitle.trim(),
        logoUrl,
        showAppTitle,
        showAppSubtitle,
        useAbrirAdobe,
        fileExtensions,
        sections,
      });

      clearRemovedSectionLocalStorage(removedSectionIds);
      setBaselineSectionIds(currentSectionIds);

      toast({
        title: "Éxito",
        description: "Configuración guardada correctamente",
      });

      setOpen(false);

      // Recargar la página después de guardar
      setTimeout(() => {
        location.reload();
      }, 500);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo guardar la configuración",
        variant: "destructive",
      });
    }
  };

  const handleReset = async () => {
    try {
      await resetSettings();
      setAppTitle('Buscador de Archivos');
      setAppSubtitle('Encuentra tus archivos locales al instante');
      setLogoUrl('');
      setShowAppTitle(true);
      setShowAppSubtitle(true);
      setUseAbrirAdobe(false);
      setFileExtensions(['pdf', 'docx']);
      setSections(DEFAULT_SECTIONS);
      setBaselineSectionIds(getNormalizedSectionIds(DEFAULT_SECTIONS));
      setIndexSectionId(DEFAULT_SECTIONS[0]?.id || "");
      setDuplicateFromSectionId("");
      setNewPath("");
      setNewExtension("");
      toast({
        title: "Reinicio",
        description: "La configuración ha sido reiniciada a los valores por defecto",
      });
      setOpen(false);
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo reiniciar la configuración",
        variant: "destructive",
      });
    }
  };

  const handleSyncDocuments = async () => {
    if (!activeIndexSection) {
      toast({
        title: "Error",
        description: "Primero selecciona una sección para indexar",
        variant: "destructive",
      });
      return;
    }

    if (activeIndexPaths.length === 0) {
      toast({
        title: "Error",
        description: "Por favor añade al menos una ruta de indexación",
        variant: "destructive",
      });
      return;
    }

    setIsSyncing(true);
    try {
      const response = await fetch('/api/index-documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ indexPaths: activeIndexPaths, sectionId: activeIndexSection.id }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || error.error || 'No se pudo sincronizar documentos');
      }

      const data = await response.json();
      toast({
        title: "Éxito",
        description: `Se indexaron ${data.count} archivos correctamente`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : 'No se pudo sincronizar documentos',
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen && isLoaded) {
      setAppTitle(settings.appTitle || "Buscador de Archivos");
      setAppSubtitle(settings.appSubtitle || "Encuentra tus archivos locales al instante");
      setLogoUrl(settings.logoUrl || "");
      setShowAppTitle(settings.showAppTitle ?? true);
      setShowAppSubtitle(settings.showAppSubtitle ?? true);
      setFileExtensions(settings.fileExtensions || ['pdf', 'docx']);
      const loadedSections = settings.sections && settings.sections.length ? settings.sections : DEFAULT_SECTIONS;
      setSections(loadedSections.map((section) => ({
        ...section,
        indexPaths: section.indexPaths || [],
      })));
      setBaselineSectionIds(getNormalizedSectionIds(loadedSections));
      setIndexSectionId(loadedSections[0]?.id || "");
      setDuplicateFromSectionId("");
      setNewSectionId("");
      setNewSectionLabel("");
      setNewSectionDescription("");
      setSelectedTheme((localStorage.getItem('file-finder-theme') as Theme) || 'system');
      setNewPath("");
      setNewExtension("");
    }
    setOpen(newOpen);
  };

  const handleToggleTheme = () => {
    const current = theme || selectedTheme || 'system';
    const next: Theme = current === 'dark' ? 'light' : 'dark';
    setSelectedTheme(next);
    updateTheme(next);
  };

  if (!isLoaded) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" title="Configuración">
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[96vw] max-w-[1200px] h-[90vh] p-0 overflow-hidden gap-0 border-border bg-card/95 backdrop-blur-xl">
        <DialogHeader className="sr-only">
          <DialogTitle>Configuración</DialogTitle>
          <DialogDescription>
            Configura las rutas de indexación y ajustes de la aplicación.
          </DialogDescription>
        </DialogHeader>

        <div className="grid h-full min-h-0 md:grid-cols-[256px_1fr] bg-background/70">
          <aside className="hidden md:flex border-r border-border bg-card/80 flex-col">
            <div className="p-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
                  <Settings className="h-4 w-4" />
                </div>
                <p className="font-bold tracking-tight">FileFinder</p>
              </div>
            </div>
            <nav className="flex-1 px-4 space-y-1 overflow-y-auto text-sm">
              <a href="#branding" className="flex items-center gap-3 px-4 py-3 bg-primary/10 text-primary rounded-xl font-medium">
                <Upload className="h-5 w-5" />
                General
              </a>
              <a href="#indexacion" className="flex items-center gap-3 px-4 py-3 text-muted-foreground hover:bg-accent/20 rounded-xl transition-all">
                <FolderOpen className="h-5 w-5" />
                Indexación
              </a>
              <a href="#secciones" className="flex items-center gap-3 px-4 py-3 text-muted-foreground hover:bg-accent/20 rounded-xl transition-all">
                <LayoutGrid className="h-5 w-5" />
                Secciones
              </a>
              <a href="#extensiones" className="flex items-center gap-3 px-4 py-3 text-muted-foreground hover:bg-accent/20 rounded-xl transition-all">
                <Puzzle className="h-5 w-5" />
                Extensiones
              </a>
            </nav>
            <div className="p-6 border-t border-border">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                  <UserCircle2 className="h-5 w-5" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-semibold">{currentUserName}</span>
                  <span className="text-xs text-muted-foreground">
                    {currentRole} · G{currentGrade}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleToggleTheme}
                className="w-full flex items-center justify-center gap-2 py-2 border border-border rounded-lg hover:bg-accent/20 transition-colors"
              >
                {selectedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                <span className="text-xs font-medium">Cambiar Tema</span>
              </button>
            </div>
          </aside>

          <div className="min-h-0 flex flex-col">
            <header className="h-16 border-b border-border flex items-center justify-between px-8 bg-card/70 backdrop-blur-md sticky top-0 z-10">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Configuración</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                <span className="font-semibold">General & Branding</span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-8 space-y-10 pb-32">
          {/* Branding Section */}
          <section id="branding" className="max-w-4xl">
            <h2 className="text-xl font-bold mb-1">Imagen del Logo</h2>
            <p className="text-sm text-muted-foreground mb-6">Sube una imagen o pega una URL para personalizar la identidad visual de tu aplicación.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border bg-card/70 rounded-2xl p-8 flex flex-col items-center justify-center group cursor-pointer hover:border-primary transition-colors"
              >
                <div className="w-12 h-12 bg-muted rounded-xl flex items-center justify-center mb-4 group-hover:bg-primary/10 transition-colors">
                  <Upload className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <p className="text-sm font-medium mb-1">{logoUrl ? "Click para cambiar logo" : "Click para subir logo"}</p>
                <p className="text-xs text-muted-foreground">PNG, SVG hasta 2MB</p>
              </button>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="logo-url-input" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    URL del Logo
                  </Label>
                  <Input
                    id="logo-url-input"
                    placeholder="https://ejemplo.com/logo.png"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    className="w-full px-4 py-3 h-12 bg-background border border-border rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="gap-2 rounded-lg">
                    <Upload className="h-4 w-4" />
                    Subir
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleRemoveLogo} disabled={!logoUrl} className="gap-2 rounded-lg">
                    <Trash2 className="h-4 w-4" />
                    Eliminar
                  </Button>
                </div>
                {logoUrl && (
                  <div className="mt-3 p-3 border border-border rounded-xl flex justify-center bg-muted/40">
                    <img
                      src={logoUrl}
                      alt="Logo preview"
                      className="max-h-16 max-w-full object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                )}
              </div>
            </div>

              <input
                title="Subir imagen del logo"
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
              <div>
                <Label htmlFor="app-title" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Título de la App</Label>
                <Input
                  id="app-title"
                  placeholder="Buscador de Archivos"
                  value={appTitle}
                  onChange={(e) => setAppTitle(e.target.value)}
                  className="w-full px-4 py-3 h-12 bg-background border border-border rounded-xl"
                />
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="show-title"
                    checked={showAppTitle}
                    onCheckedChange={(checked) => setShowAppTitle(checked as boolean)}
                  />
                  <Label htmlFor="show-title" className="text-xs font-normal cursor-pointer text-muted-foreground">Mostrar</Label>
                </div>
              </div>
              <div>
                <Label htmlFor="app-subtitle" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Subtítulo</Label>
                <Input
                  id="app-subtitle"
                  placeholder="Encuentra tus archivos locales al instante"
                  value={appSubtitle}
                  onChange={(e) => setAppSubtitle(e.target.value)}
                  className="w-full px-4 py-3 h-12 bg-background border border-border rounded-xl"
                />
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="show-subtitle"
                    checked={showAppSubtitle}
                    onCheckedChange={(checked) => setShowAppSubtitle(checked as boolean)}
                  />
                  <Label htmlFor="show-subtitle" className="text-xs font-normal cursor-pointer text-muted-foreground">Mostrar</Label>
                </div>
              </div>
            </div>
          </section>

          <section id="indexacion" className="max-w-4xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold mb-1">Rutas de Indexación</h2>
                <p className="text-sm text-muted-foreground">Añade directorios para escanear archivos y crear el índice por sección.</p>
              </div>
              <Button
                onClick={handleAddPath}
                className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all shadow-lg shadow-primary/20"
              >
                <Plus className="h-4 w-4" />
                Añadir Ruta
              </Button>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Sección a indexar</Label>
              <select
                value={activeIndexSection?.id || ""}
                onChange={(e) => setIndexSectionId(e.target.value)}
                className="w-full h-10 rounded-xl border border-border bg-background px-3 py-2 text-sm"
              >
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.label} ({section.indexPaths?.length || 0})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2 items-end">
              <div className="flex-1 space-y-2">
                <Label className="text-xs">Duplicar rutas desde</Label>
                <select
                  value={duplicateFromSectionId}
                  onChange={(e) => setDuplicateFromSectionId(e.target.value)}
                  className="w-full h-10 rounded-xl border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="">Selecciona una sección</option>
                  {sections
                    .filter((section) => section.id !== activeIndexSection?.id)
                    .map((section) => (
                      <option key={section.id} value={section.id}>
                        {section.label} ({section.indexPaths?.length || 0})
                      </option>
                    ))}
                </select>
              </div>
              <Button variant="outline" size="sm" onClick={handleDuplicatePaths} className="h-10 rounded-lg">
                Duplicar
              </Button>
            </div>

            <div className="flex gap-2">
              <Input
                placeholder="p.ej., C:\\Users\\Documentos o /home/usuario/archivos"
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddPath()}
                className="flex-1 h-11 rounded-xl bg-background border-border"
              />
              <Button onClick={handleAddPath} size="sm" className="gap-2 rounded-lg">
                <Plus className="h-4 w-4" />
                Añadir
              </Button>
            </div>

            <div className="bg-card/80 border border-border rounded-2xl overflow-hidden divide-y divide-border max-h-64 overflow-y-auto">
              {activeIndexPaths.length === 0 ? (
                <div className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">
                    Aún no hay rutas añadidas
                  </p>
                </div>
              ) : (
                activeIndexPaths.map((path, index) => (
                  <div key={path} className="flex items-center justify-between p-4 hover:bg-accent/20 transition-colors">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className={`p-2 rounded-lg ${index % 2 === 0 ? 'bg-accent/20 text-accent' : 'bg-primary/20 text-primary'}`}>
                        <FolderOpen className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{path}</p>
                        <p className="text-xs text-muted-foreground">Sección: {activeIndexSection?.label || "N/A"}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemovePath(path)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      title="Eliminar ruta"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>

          <section id="secciones" className="max-w-4xl">
            <h2 className="text-xl font-bold mb-1">Secciones Personalizadas</h2>
            <p className="text-sm text-muted-foreground mb-6">Organiza tus reportes y búsquedas en categorías lógicas.</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
              {sections.map((section) => (
                <div key={section.id} className="p-5 border border-border bg-card/80 rounded-2xl flex flex-col justify-between group hover:border-primary transition-all">
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center">
                      <LayoutGrid className="h-5 w-5" />
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="p-1.5 hover:bg-accent/20 rounded-lg text-muted-foreground" type="button" title="Editar">
                        <Settings className="h-4 w-4" />
                      </button>
                      <button
                        className="p-1.5 hover:bg-destructive/10 rounded-lg text-muted-foreground hover:text-destructive"
                        type="button"
                        title="Eliminar"
                        onClick={() => handleRemoveSection(section.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground">{section.label}</h3>
                    <p className="text-xs text-muted-foreground">{section.description || "Sin descripción"}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">ID: {section.id}</p>
                  </div>
                </div>
              ))}
              <button className="p-5 border-2 border-dashed border-border hover:border-primary/60 transition-colors rounded-2xl flex flex-col items-center justify-center gap-2 group min-h-[140px]" type="button">
                <Plus className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground">Nueva Sección</span>
              </button>
            </div>

            <div className="grid gap-2 rounded-2xl border border-border bg-card/80 p-4">
              <Input
                placeholder="ID (ej: libros, curriculum)"
                value={newSectionId}
                onChange={(e) => setNewSectionId(e.target.value)}
              />
              <Input
                placeholder="Nombre (ej: Libros, Curriculum)"
                value={newSectionLabel}
                onChange={(e) => setNewSectionLabel(e.target.value)}
              />
              <Input
                placeholder="Descripcion (opcional)"
                value={newSectionDescription}
                onChange={(e) => setNewSectionDescription(e.target.value)}
              />
              <Button onClick={handleAddSection} size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Anadir Seccion
              </Button>
            </div>
          </section>

          <section id="extensiones" className="max-w-4xl">
            <h2 className="text-xl font-bold mb-1">Extensiones de Archivos</h2>
            <p className="text-sm text-muted-foreground mb-6">Selecciona los tipos de archivos que FileFinder debe indexar.</p>

            <div className="flex gap-2">
              <Input
                placeholder="p.ej., pdf, docx, xlsx"
                value={newExtension}
                onChange={(e) => setNewExtension(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddExtension(newExtension)}
                className="flex-1"
              />
              <Button onClick={() => handleAddExtension(newExtension)} size="sm" className="gap-2 rounded-lg">
                <Plus className="h-4 w-4" />
                Añadir
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              {fileExtensions.map((ext) => (
                <div
                  key={ext}
                  className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-bold rounded-lg flex items-center gap-2 shadow-lg shadow-primary/20"
                >
                  .{ext.toUpperCase()}
                  <button
                    title="Eliminar extensión"
                    type="button"
                    onClick={() => handleRemoveExtension(ext)}
                    className="cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {COMMON_EXTENSIONS.filter((ext) => !fileExtensions.includes(ext)).slice(0, 6).map((ext) => (
                <button
                  key={ext}
                  type="button"
                  onClick={() => handleAddExtension(ext)}
                  className="px-3 py-1.5 bg-muted border border-border text-muted-foreground text-xs font-bold rounded-lg flex items-center gap-2 hover:border-primary transition-colors"
                >
                  .{ext.toUpperCase()}
                  <Plus className="h-3 w-3" />
                </button>
              ))}
            </div>
          </section>
        </div>

            <footer className="p-6 bg-card/80 backdrop-blur-xl border-t border-border flex justify-between items-center z-20">
              <Button
                variant="ghost"
                onClick={handleReset}
                className="px-6 py-2.5 text-muted-foreground hover:text-foreground font-medium transition-colors flex items-center gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                Reiniciar Valores
              </Button>
              <div className="flex gap-4">
                <Button
                  variant="outline"
                  onClick={handleSyncDocuments}
                  disabled={isSyncing || activeIndexPaths.length === 0}
                  className="px-6 py-2.5 bg-muted hover:bg-muted/80 rounded-xl font-semibold transition-all flex items-center gap-2 text-foreground"
                >
                  <Zap className="h-4 w-4" />
                  {isSyncing ? 'Sincronizando...' : 'Sincronizar'}
                </Button>
                <Button onClick={handleSave} className="px-10 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-bold shadow-xl shadow-primary/25 transition-all flex items-center gap-2">
                  <Save className="h-4 w-4" />
                  Guardar Cambios
                </Button>
              </div>
            </footer>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
