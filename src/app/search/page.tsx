import type { Metadata } from 'next';
import { SearchHero } from '@/components/search-hero';

export const metadata: Metadata = {
  title: 'Busqueda de Libros | CMSA',
  description: 'Buscador de libros de la biblioteca.',
};

export default function SearchPage() {
  return (
    <div className="container mx-auto px-4 md:px-6">
      <SearchHero />
    </div>
  );
}
