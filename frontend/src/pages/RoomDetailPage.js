import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import api from '@/lib/api';
import { LocationBreadcrumb } from '@/components/LocationBreadcrumb';
import {
  DoorOpen,
  Plus,
  ArrowLeft,
  Radio,
  Edit,
  Trash2,
  Bath,
  UtensilsCrossed,
  Bed,
  Sofa,
  MoreHorizontal,
  Loader2,
  Link,
  Unlink,
  CheckCircle
} from 'lucide-react';

export function RoomDetailPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  
  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [availableRadars, setAvailableRadars] = useState([]);
  
  // Space modal
  const [showSpaceModal, setShowSpaceModal] = useState(false);
  const [spaceForm, setSpaceForm] = useState({ name: '', space_type: 'OTHER' });
  
  // Assign radar modal
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedSpace, setSelectedSpace] = useState(null);
  const [selectedRadar, setSelectedRadar] = useState('');
  
  const [creating, setCreating] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const roomRes = await api.get(`/rooms/${roomId}`);
      setRoom(roomRes.data);
      
      // Fetch unassigned radars for this client
      if (roomRes.data.client_id) {
        const radarsRes = await api.get(`/clients/${roomRes.data.client_id}/radars`, {
          params: { unassigned: true }
        });
        setAvailableRadars(radarsRes.data);
      }
    } catch (error) {
      console.error('Failed to fetch room data:', error);
      toast.error('Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAddSpace = async () => {
    if (!spaceForm.name.trim() && spaceForm.space_type === 'OTHER') {
      toast.error('Le nom de l\'espace est requis pour le type "Autre"');
      return;
    }

    setCreating(true);
    try {
      await api.post(`/rooms/${roomId}/spaces`, spaceForm);
      setShowSpaceModal(false);
      setSpaceForm({ name: '', space_type: 'OTHER' });
      toast.success('Espace ajouté');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erreur lors de l\'ajout');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteSpace = async (spaceId) => {
    if (!window.confirm('Supprimer cet espace ?')) return;
    
    try {
      await api.delete(`/room-spaces/${spaceId}`);
      toast.success('Espace supprimé');
      fetchData();
    } catch (error) {
      toast.error('Erreur lors de la suppression');
    }
  };

  const handleAssignRadar = async () => {
    if (!selectedRadar) {
      toast.error('Sélectionnez un radar');
      return;
    }

    setAssigning(true);
    try {
      await api.post(`/radars/${selectedRadar}/assign`, {
        room_space_id: selectedSpace?.id || null,
        room_id: selectedSpace ? null : roomId,
        reason: `Affectation à ${selectedSpace ? selectedSpace.name || selectedSpace.space_type : 'la chambre'}`
      });
      setShowAssignModal(false);
      setSelectedRadar('');
      setSelectedSpace(null);
      toast.success('Radar affecté');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erreur lors de l\'affectation');
    } finally {
      setAssigning(false);
    }
  };

  const handleUnassignRadar = async (radarId) => {
    if (!window.confirm('Désaffecter ce radar ?')) return;
    
    try {
      await api.post(`/radars/${radarId}/unassign`);
      toast.success('Radar désaffecté');
      fetchData();
    } catch (error) {
      toast.error('Erreur lors de la désaffectation');
    }
  };

  const getSpaceIcon = (type) => {
    switch (type) {
      case 'BEDROOM': return <Bed className="h-5 w-5" />;
      case 'BATHROOM': return <Bath className="h-5 w-5" />;
      case 'KITCHENETTE': return <UtensilsCrossed className="h-5 w-5" />;
      case 'LIVING': return <Sofa className="h-5 w-5" />;
      default: return <MoreHorizontal className="h-5 w-5" />;
    }
  };

  const getSpaceColor = (type) => {
    const colors = {
      BEDROOM: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
      BATHROOM: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
      KITCHENETTE: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
      LIVING: 'bg-green-500/10 text-green-500 border-green-500/20',
      OTHER: 'bg-muted text-muted-foreground border-border'
    };
    return colors[type] || colors.OTHER;
  };

  const getSpaceLabel = (type) => {
    const labels = {
      BEDROOM: 'Chambre à coucher',
      BATHROOM: 'Salle de bain',
      KITCHENETTE: 'Kitchenette',
      LIVING: 'Salon',
      BALCONY: 'Balcon',
      OTHER: 'Autre'
    };
    return labels[type] || type;
  };

  const getRoomTypeLabel = (type) => {
    const labels = {
      SINGLE: 'Chambre simple',
      DOUBLE: 'Chambre double',
      SUITE: 'Suite',
      STUDIO: 'Studio',
      OTHER: 'Autre'
    };
    return labels[type] || type;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!room) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <p className="text-muted-foreground">Chambre non trouvée</p>
        <Button onClick={() => navigate(-1)}>Retour</Button>
      </div>
    );
  }

  const spaces = room.spaces || [];

  return (
    <div data-testid="room-detail-page" className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/floors/${room.floor_id}`)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="p-3 rounded-lg bg-green-500/10">
            <DoorOpen className="h-6 w-6 text-green-500" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Chambre {room.room_number}</h1>
            <p className="text-muted-foreground">
              {getRoomTypeLabel(room.room_type)} • {room.spaces_count} espaces • {room.radars_count} radars
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            onClick={() => {
              setSelectedSpace(null);
              setShowAssignModal(true);
            }}
          >
            <Link className="h-4 w-4 mr-2" />
            Affecter un radar
          </Button>
          <Button onClick={() => setShowSpaceModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Ajouter un espace
          </Button>
        </div>
      </div>

      {/* Room Info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Espaces</CardTitle>
          </CardHeader>
          <CardContent>
            {spaces.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <Bed className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Aucun espace configuré</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {spaces.map((space) => (
                  <div
                    key={space.id}
                    className={cn(
                      'p-4 rounded-lg border-2 transition-all',
                      getSpaceColor(space.space_type)
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn('p-2 rounded-lg', getSpaceColor(space.space_type))}>
                          {getSpaceIcon(space.space_type)}
                        </div>
                        <div>
                          <p className="font-medium">
                            {space.name || getSpaceLabel(space.space_type)}
                          </p>
                          <Badge variant="outline" className="mt-1">
                            {getSpaceLabel(space.space_type)}
                          </Badge>
                        </div>
                      </div>
                      
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleDeleteSpace(space.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    
                    {/* Radar info */}
                    <div className="mt-4 pt-4 border-t border-current/10">
                      {space.has_radar && space.radar ? (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Radio className="h-4 w-4 text-green-500" />
                            <span className="text-sm">
                              {space.radar.name || space.radar.device_id?.substring(0, 15)}
                            </span>
                            <Badge 
                              variant="outline" 
                              className={space.radar.status === 'ONLINE' ? 'bg-green-500/10 text-green-500' : ''}
                            >
                              {space.radar.status}
                            </Badge>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleUnassignRadar(space.radar.id)}
                          >
                            <Unlink className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="w-full"
                          onClick={() => {
                            setSelectedSpace(space);
                            setShowAssignModal(true);
                          }}
                        >
                          <Link className="h-4 w-4 mr-2" />
                          Affecter un radar
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Room Details */}
        <Card>
          <CardHeader>
            <CardTitle>Informations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-muted-foreground text-xs">Numéro</Label>
              <p className="font-medium text-lg">{room.room_number}</p>
            </div>
            
            {room.name && (
              <div>
                <Label className="text-muted-foreground text-xs">Nom</Label>
                <p>{room.name}</p>
              </div>
            )}
            
            <div>
              <Label className="text-muted-foreground text-xs">Type</Label>
              <p>{getRoomTypeLabel(room.room_type)}</p>
            </div>
            
            <div>
              <Label className="text-muted-foreground text-xs">Capacité</Label>
              <p>{room.capacity} personne{room.capacity > 1 ? 's' : ''}</p>
            </div>
            
            {room.occupant_name && (
              <div>
                <Label className="text-muted-foreground text-xs">Occupant</Label>
                <p className="text-primary">{room.occupant_name}</p>
                {room.occupant_info && (
                  <p className="text-sm text-muted-foreground">{room.occupant_info}</p>
                )}
              </div>
            )}
            
            {room.notes && (
              <div>
                <Label className="text-muted-foreground text-xs">Notes</Label>
                <p className="text-sm">{room.notes}</p>
              </div>
            )}
            
            <div className="pt-4 border-t">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Radars installés</span>
                <span className="font-medium">{room.radars_count || 0}</span>
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-muted-foreground">Espaces</span>
                <span className="font-medium">{spaces.length}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Add Space Modal */}
      <Dialog open={showSpaceModal} onOpenChange={setShowSpaceModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter un espace</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Type d'espace</Label>
              <Select 
                value={spaceForm.space_type} 
                onValueChange={(v) => setSpaceForm(prev => ({ 
                  ...prev, 
                  space_type: v,
                  name: v !== 'OTHER' ? '' : prev.name
                }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BATHROOM">
                    <span className="flex items-center gap-2">
                      <Bath className="h-4 w-4" /> Salle de bain
                    </span>
                  </SelectItem>
                  <SelectItem value="KITCHENETTE">
                    <span className="flex items-center gap-2">
                      <UtensilsCrossed className="h-4 w-4" /> Kitchenette
                    </span>
                  </SelectItem>
                  <SelectItem value="LIVING">
                    <span className="flex items-center gap-2">
                      <Sofa className="h-4 w-4" /> Salon
                    </span>
                  </SelectItem>
                  <SelectItem value="OTHER">
                    <span className="flex items-center gap-2">
                      <MoreHorizontal className="h-4 w-4" /> Autre
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {spaceForm.space_type === 'OTHER' && (
              <div className="space-y-2">
                <Label>Nom de l'espace *</Label>
                <Input
                  value={spaceForm.name}
                  onChange={(e) => setSpaceForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Ex: Balcon, Dressing, ..."
                />
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSpaceModal(false)}>
              Annuler
            </Button>
            <Button onClick={handleAddSpace} disabled={creating}>
              {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Ajouter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Radar Modal */}
      <Dialog open={showAssignModal} onOpenChange={setShowAssignModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Affecter un radar
              {selectedSpace && ` à ${selectedSpace.name || getSpaceLabel(selectedSpace.space_type)}`}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {availableRadars.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <Radio className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Aucun radar disponible</p>
                <p className="text-sm mt-2">Tous les radars sont déjà affectés</p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Sélectionner un radar</Label>
                  <Select value={selectedRadar} onValueChange={setSelectedRadar}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choisir un radar..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableRadars.map(radar => (
                        <SelectItem key={radar.id} value={radar.id}>
                          <span className="flex items-center gap-2">
                            <Radio className={cn(
                              "h-4 w-4",
                              radar.status === 'ONLINE' ? 'text-green-500' : 'text-muted-foreground'
                            )} />
                            {radar.name || radar.device_id?.substring(0, 20)}
                            <Badge variant="outline" className="ml-2">
                              {radar.status}
                            </Badge>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {!selectedSpace && spaces.length > 0 && (
                  <div className="space-y-2">
                    <Label>Affecter à un espace spécifique (optionnel)</Label>
                    <Select 
                      value={selectedSpace?.id || ''} 
                      onValueChange={(v) => setSelectedSpace(spaces.find(s => s.id === v) || null)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Chambre entière" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Chambre entière</SelectItem>
                        {spaces.map(space => (
                          <SelectItem key={space.id} value={space.id}>
                            {space.name || getSpaceLabel(space.space_type)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignModal(false)}>
              Annuler
            </Button>
            <Button 
              onClick={handleAssignRadar} 
              disabled={assigning || !selectedRadar || availableRadars.length === 0}
            >
              {assigning && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Affecter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default RoomDetailPage;
