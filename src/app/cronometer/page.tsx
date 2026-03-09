import type { Metadata } from 'next';
import { CronometerApp } from '@/components/cronometer-app';
import { requireServerSession } from '@/lib/auth/server';

export const metadata: Metadata = {
  title: 'Cronometro | CMSA',
  description: 'Cronometro con control de tiempo y costo.',
};

export default async function CronometerPage() {
  await requireServerSession('/cronometer');
  return <CronometerApp />;
}
