"use client";

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { AuctionItem } from '@/types';
import { AuctionCard } from '@/components/dashboard/AuctionCard';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Heart, Trash2, Edit2, Save, X } from 'lucide-react';

interface Favorite {
  id: string;
  auctionId: string;
  notes: string | null;
  createdAt: string;
  auction: any;
}

export default function FavoritesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState('');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login?callbackUrl=/favorites');
    }
  }, [status, router]);

  useEffect(() => {
    if (session?.user?.id) {
      fetchFavorites();
    }
  }, [session]);

  const fetchFavorites = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/favorites');
      const result = await response.json();
      
      if (result.success) {
        setFavorites(result.data);
      }
    } catch (error) {
      console.error('Error fetching favorites:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (auctionId: string) => {
    if (!confirm('¿Eliminar de favoritos?')) return;
    
    try {
      const response = await fetch(`/api/favorites?auctionId=${auctionId}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        setFavorites(favorites.filter(f => f.auctionId !== auctionId));
      }
    } catch (error) {
      console.error('Error deleting favorite:', error);
    }
  };

  const handleEditStart = (favorite: Favorite) => {
    setEditingId(favorite.id);
    setEditNotes(favorite.notes || '');
  };

  const handleEditSave = async (auctionId: string) => {
    try {
      const response = await fetch('/api/favorites', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auctionId, notes: editNotes }),
      });
      
      if (response.ok) {
        const result = await response.json();
        setFavorites(favorites.map(f => 
          f.auctionId === auctionId ? result.data : f
        ));
        setEditingId(null);
      }
    } catch (error) {
      console.error('Error updating notes:', error);
    }
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditNotes('');
  };

  if (status === 'loading' || loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
          <p className="mt-4 text-gray-500">Cargando favoritos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2 flex items-center gap-3">
            <Heart className="h-10 w-10 text-red-500 fill-red-500" />
            Tus Favoritas
          </h1>
          <p className="text-gray-600">
            {favorites.length} {favorites.length === 1 ? 'subasta guardada' : 'subastas guardadas'}
          </p>
        </div>

        {favorites.length === 0 ? (
          <div className="bg-white rounded-lg p-12 text-center">
            <Heart className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">
              No tienes favoritas
            </h2>
            <p className="text-gray-600 mb-6">
              Guarda subastas para acceder rápidamente más tarde
            </p>
            <Button onClick={() => router.push('/')}>
              Explorar Subastas
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {favorites.map((favorite) => {
              const auction: AuctionItem = {
                id: favorite.auction.id,
                title: favorite.auction.title,
                category: favorite.auction.category,
                province: favorite.auction.province,
                community: '',  // Not stored in DB
                currentBid: favorite.auction.currentBid,
                appraisalValue: favorite.auction.appraisalValue,
                minimumBid: favorite.auction.minimumBid,
                courtName: favorite.auction.courtName,
                procedureNumber: favorite.auction.procedureNumber,
                boeLink: favorite.auction.boeLink,
                edictUrl: favorite.auction.edictUrl,
                pdfUrl: favorite.auction.pdfUrl,
                status: favorite.auction.status,
                endDate: new Date(favorite.auction.endsAt),
                source: favorite.auction.source,
                imageUrl: favorite.auction.imageUrl || '/api/placeholder/400/300',
                address: favorite.auction.address,
                latitude: favorite.auction.latitude,
                longitude: favorite.auction.longitude,
                courtReference: favorite.auction.courtReference,
                originalSource: favorite.auction.originalSource,
                municipality: favorite.auction.municipality,
              };

              return (
                <div key={favorite.id} className="bg-white rounded-lg shadow-md p-6">
                  <div className="grid md:grid-cols-[300px_1fr] gap-6">
                    {/* Auction Card */}
                    <div>
                      <AuctionCard
                        item={auction}
                        userTier="gold"
                        onClick={() => router.push(`/?auction=${auction.id}`)}
                      />
                    </div>

                    {/* Notes Section */}
                    <div className="flex flex-col">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-gray-900">
                          Notas Privadas
                        </h3>
                        <div className="flex gap-2">
                          {editingId === favorite.id ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={handleEditCancel}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => handleEditSave(favorite.auctionId)}
                              >
                                <Save className="h-4 w-4 mr-2" />
                                Guardar
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleEditStart(favorite)}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleDelete(favorite.auctionId)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>

                      {editingId === favorite.id ? (
                        <Textarea
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          placeholder="Añade tus notas aquí..."
                          className="min-h-[150px]"
                        />
                      ) : (
                        <div className="bg-gray-50 rounded-lg p-4 flex-1">
                          {favorite.notes ? (
                            <p className="text-gray-700 whitespace-pre-wrap">{favorite.notes}</p>
                          ) : (
                            <p className="text-gray-400 italic">Sin notas</p>
                          )}
                        </div>
                      )}

                      <div className="mt-4 text-sm text-gray-500">
                        Guardado el {new Date(favorite.createdAt).toLocaleDateString('es-ES', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
