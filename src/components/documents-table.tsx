"use client";

import { useState } from "react";
import { Search, ChevronLeft, ChevronRight, FileIcon, ExternalLink, Filter, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DocumentMetadataEditor } from "@/components/document-metadata-editor";
import { useDocuments, type Document } from "@/hooks/use-documents";
import { useToast } from "@/hooks/use-toast";

export function DocumentsTable() {
  const { toast } = useToast();
  const {
    documents,
    searchQuery,
    handleSearch,
    itemsPerPage,
    handleItemsPerPageChange,
    availableSections,
    availableExtensions,
    customExtensions,
    selectedExtensions,
    selectedSection,
    setSelectedSection,
    toggleExtension,
    selectAllExtensions,
    selectOnlyExtension,
    addCustomExtension,
    removeCustomExtension,
    currentPage,
    handlePageChange,
    totalPages,
    filteredTotal,
    loading,
    updateDocumentPrice,
    updateDocument,
  } = useDocuments();

  const [selectedDocument, setSelectedDocument] = useState<Document | null>(
    null
  );
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [newExtension, setNewExtension] = useState("");

  const extensionSummary =
    selectedExtensions.length === 1
      ? `.${selectedExtensions[0]}`
      : `${selectedExtensions.length} tipos`;

  const handleAddCustomExtension = () => {
    const result = addCustomExtension(newExtension);
    if (!result.ok) {
      toast({
        title: "Filtro",
        description: result.error,
        variant: "destructive",
      });
      return;
    }

    setNewExtension("");
    toast({
      title: "Filtro agregado",
      description: `Se agregó .${result.extension}`,
    });
  };

  const handleOpenEditor = (doc: Document) => {
    setSelectedDocument(doc);
    setIsEditorOpen(true);
  };

  const handleSavePrice = (docId: string, precio: number) => {
    updateDocumentPrice(docId, precio);
  };

  const handleOpenFile = (ruta: string) => {
    const trimmed = typeof ruta === "string" ? ruta.trim() : "";
    if (!trimmed) {
      toast({
        title: "No se pudo abrir",
        description: "El documento no tiene una ruta válida.",
        variant: "destructive",
      });
      return;
    }

    const url = `/api/files?path=${encodeURIComponent(trimmed)}`;

    try {
      const popup = window.open(url, "_blank", "noopener,noreferrer");
      if (!popup) {
        toast({
          title: "Navegador bloqueó la apertura",
          description: "Permite ventanas emergentes para abrir documentos en una nueva pestaña.",
          variant: "destructive",
        });
      }
    } catch (e) {
      console.error("Unable to open file url:", url, e);
      toast({
        title: "No se pudo abrir",
        description: "Ocurrió un error al intentar abrir el documento.",
        variant: "destructive",
      });
    }
  };

  const getFileExtension = (nombre: string) => {
    return nombre.split(".").pop()?.toUpperCase() || "FILE";
  };

  const formatPrecio = (precio: number | string | undefined) => {
    if (precio === undefined || precio === null || precio === "") return null;
    if (typeof precio === "number") return `$${precio.toFixed(2)}`;
    return String(precio);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">Cargando documentos...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Buscador */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre o ruta..."
          className="pl-10"
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
        />
      </div>

      {/* Info y controles */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Mostrando {documents.length} de {filteredTotal} documentos
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Filter className="h-4 w-4" />
                Tipos: {extensionSummary}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Extensiones visibles</p>
                <span className="text-xs text-muted-foreground">
                  {availableExtensions.length} disponibles
                </span>
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-7 text-xs px-2"
                  onClick={() => selectOnlyExtension("pdf")}
                >
                  Solo .pdf
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs px-2"
                  onClick={selectAllExtensions}
                >
                  Todas
                </Button>
              </div>

              <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
                {availableExtensions.map((extension) => {
                  const isCustom = customExtensions.includes(extension);
                  return (
                    <div
                      key={extension}
                      className="flex items-center justify-between rounded-md border px-2 py-1.5"
                    >
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={selectedExtensions.includes(extension)}
                          onCheckedChange={() => toggleExtension(extension)}
                        />
                        <span>.{extension}</span>
                      </label>
                      {isCustom ? (
                        <button
                          type="button"
                          className="inline-flex h-6 w-6 items-center justify-center rounded-md border hover:bg-accent"
                          title={`Eliminar .${extension}`}
                          onClick={() => removeCustomExtension(extension)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <div className="border-t pt-2 space-y-2">
                <p className="text-xs text-muted-foreground">Agregar filtro custom</p>
                <div className="flex items-center gap-2">
                  <Input
                    value={newExtension}
                    onChange={(e) => setNewExtension(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddCustomExtension();
                      }
                    }}
                    placeholder=".epub"
                    className="h-8"
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 px-2"
                    onClick={handleAddCustomExtension}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Sección */}
          {availableSections && availableSections.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Sección:</span>
              <Select
                value={selectedSection}
                onValueChange={(value) => setSelectedSection(value)}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableSections.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Por página:</span>
            <Select
              value={itemsPerPage.toString()}
              onValueChange={(value) => handleItemsPerPageChange(parseInt(value))}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="100">100</SelectItem>
                <SelectItem value="500">500</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre del Archivo</TableHead>
              <TableHead className="hidden md:table-cell">Ruta</TableHead>
              <TableHead className="text-center">Precio</TableHead>
              <TableHead className="text-center">Acción</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.length > 0 ? (
              documents.map((doc) => (
                <TableRow key={doc.id} className="hover:bg-accent">
                  <TableCell className="font-medium max-w-xs">
                    <div className="flex items-center gap-2">
                      <FileIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{doc.nombre}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {getFileExtension(doc.nombre)}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell max-w-xs">
                    <p className="truncate text-sm text-muted-foreground">
                      {doc.ruta}
                    </p>
                  </TableCell>
                  <TableCell className="text-center">
                    {formatPrecio(doc.precio) ? (
                      <span className="font-semibold">{formatPrecio(doc.precio)}</span>
                    ) : (
                      <span className="text-muted-foreground text-sm">Sin precio</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center gap-2 justify-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Abrir"
                        onClick={() => handleOpenFile(doc.ruta)}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenEditor(doc)}
                      >
                        Editar
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8">
                  <p className="text-muted-foreground">
                    No se encontraron documentos
                  </p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Página {currentPage} de {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            {/* Números de página */}
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                return (
                  <Button
                    key={pageNum}
                    variant={
                      currentPage === pageNum ? "default" : "outline"
                    }
                    size="sm"
                    className="min-w-10"
                    onClick={() => handlePageChange(pageNum)}
                  >
                    {pageNum}
                  </Button>
                );
              })}
            </div>

            <Button
              variant="outline"
              size="icon"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Editor de precio */}
      <DocumentMetadataEditor
        document={
          (selectedDocument as any) || { id: "", nombre: "", ruta: "" }
        }
        sectionId={selectedSection}
        open={isEditorOpen}
        onOpenChange={setIsEditorOpen}
        showTrigger={false}
        onSaved={(doc) => {
          if (doc?.id) {
            updateDocument(doc as any);
          }
          setIsEditorOpen(false);
        }}
      />
    </div>
  );
}
