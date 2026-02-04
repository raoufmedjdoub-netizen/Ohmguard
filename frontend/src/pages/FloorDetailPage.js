import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import api from '@/lib/api';
import { LocationBreadcrumb } from '@/components/LocationBreadcrumb';
import {
  Layers,
  DoorOpen,
  Plus,
  ArrowLeft,
  Radio,
  Edit,
  Trash2,
  Bath,
  UtensilsCrossed,
  Bed,
  ChevronRight,
  Loader2,
  Users,
  MapPin
} from 'lucide-react';

export function FloorDetailPage() {
  const { floorId } = useParams();
  const navigate = useNavigate();
  
  const [floor, setFloor] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Room modal
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [roomForm, setRoomForm] = useState({
    room_number: '',
    name: '',
    room_type: 'SINGLE',
    capacity: 1,
    create_bathroom: true,
    create_kitchenette: false
  });
  const [creating, setCreating] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [floorRes, roomsRes] = await Promise.all([
        api.get(`/floors/${floorId}`),
        api.get(`/floors/${floorId}/rooms`)
      ]);
      
      setFloor(floorRes.data);
      setRooms(roomsRes.data);
      
      // Get zones for this floor
      if (floorRes.data.building_id) {
        const zonesRes = await api.get(`/buildings/${floorRes.data.building_id}/zones`, {
          params: { floor_id: floorId }
        });
        setZones(zonesRes.data.filter(z => z.floor_id === floorId));
      }
    } catch (error) {
      console.error('Failed to fetch floor data:', error);
      toast.error('Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  }, [floorId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreateRoom = async () => {
    if (!roomForm.room_number.trim()) {
      toast.error('Le numéro de chambre est requis');
      return;
    }

    setCreating(true);
    try {
      await api.post(`/floors/${floorId}/rooms`, roomForm);
      setShowRoomModal(false);
      setRoomForm({
        room_number: '',
        name: '',
        room_type: 'SINGLE',
        capacity: 1,
        create_bathroom: true,
        create_kitchenette: false
      });
      toast.success('Chambre créée');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erreur lors de la création');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteRoom = async (roomId) => {
    if (!window.confirm('Supprimer cette chambre et tous ses espaces ?')) return;
    
    try {
      await api.delete(`/rooms/${roomId}`);
      toast.success('Chambre supprimée');
      fetchData();
    } catch (error) {
      toast.error('Erreur lors de la suppression');
    }
  };

  const getRoomTypeLabel = (type) => {
    const labels = {
      SINGLE: 'Simple',
      DOUBLE: 'Double',
      SUITE: 'Suite',
      STUDIO: 'Studio',
      OTHER: 'Autre'
    };
    return labels[type] || type;
  };

  const getRoomTypeColor = (type) => {
    const colors = {
      SINGLE: 'bg-blue-500/10 text-blue-500',
      DOUBLE: 'bg-green-500/10 text-green-500',
      SUITE: 'bg-purple-500/10 text-purple-500',
      STUDIO: 'bg-amber-500/10 text-amber-500',
      OTHER: 'bg-muted text-muted-foreground'
    };
    return colors[type] || colors.OTHER;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!floor) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <p className="text-muted-foreground">Étage non trouvé</p>
        <Button onClick={() => navigate(-1)}>Retour</Button>
      </div>
    );
  }

  return (
    <div data-testid="floor-detail-page" className="space-y-6">
      {/* Breadcrumb */}
      <LocationBreadcrumb 
        items={[
          { type: 'organisation', label: floor.client_name || 'Organisation', href: `/organisations/${floor.client_id}` },
          { type: 'building', label: floor.building_name || 'Bâtiment', href: `/buildings/${floor.building_id}` },
          { type: 'floor', label: floor.name, href: null }
        ]} 
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/buildings/${floor.building_id}`)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="p-3 rounded-lg bg-amber-500/10">
            <Layers className="h-6 w-6 text-amber-500" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{floor.name}</h1>
            <p className="text-muted-foreground">
              Niveau {floor.index} • {floor.rooms_count} chambres • {floor.radars_count || 0} capteurs
            </p>
          </div>
        </div>
        
        <Button onClick={() => setShowRoomModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nouvelle Chambre
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <DoorOpen className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <div className="text-2xl font-bold">{rooms.length}</div>
                <div className="text-sm text-muted-foreground">Chambres</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-cyan-500/10">
                <Bath className="h-5 w-5 text-cyan-500" />
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {rooms.reduce((acc, r) => acc + (r.spaces_count || 0), 0)}
                </div>
                <div className="text-sm text-muted-foreground">Espaces</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Radio className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="text-2xl font-bold">{floor.radars_count || 0}</div>
                <div className="text-sm text-muted-foreground">Radars</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-violet-500/10">
                <Users className="h-5 w-5 text-violet-500" />
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {rooms.reduce((acc, r) => acc + (r.capacity || 1), 0)}
                </div>
                <div className="text-sm text-muted-foreground">Capacité totale</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Rooms Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <DoorOpen className="h-5 w-5" />
              Chambres
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {rooms.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <DoorOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Aucune chambre sur cet étage</p>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => setShowRoomModal(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Créer une chambre
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Chambre</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Capacité</TableHead>
                  <TableHead>Espaces</TableHead>
                  <TableHead>Radars</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rooms.sort((a, b) => a.room_number.localeCompare(b.room_number)).map((room) => (
                  <TableRow 
                    key={room.id}
                    className="cursor-pointer hover:bg-accent/50"
                    onClick={() => navigate(`/rooms/${room.id}`)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-green-500/10">
                          <DoorOpen className="h-4 w-4 text-green-500" />
                        </div>
                        <div>
                          <p className="font-medium">Ch. {room.room_number}</p>
                          {room.name && (
                            <p className="text-xs text-muted-foreground">{room.name}</p>
                          )}
                          {room.occupant_name && (
                            <p className="text-xs text-primary">{room.occupant_name}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getRoomTypeColor(room.room_type)}>
                        {getRoomTypeLabel(room.room_type)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        {room.capacity}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Bed className="h-3 w-3" />
                        {room.spaces_count || 0}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Radio className={cn(
                          "h-3 w-3",
                          room.radars_count > 0 ? "text-green-500" : "text-muted-foreground"
                        )} />
                        {room.radars_count || 0}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/rooms/${room.id}`);
                          }}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteRoom(room.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Zones on this floor */}
      {zones.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Zones de cet étage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {zones.map(zone => (
                <div key={zone.id} className="p-4 border rounded-lg">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-purple-500" />
                    <span className="font-medium">{zone.name}</span>
                  </div>
                  <Badge variant="outline" className="mt-2">{zone.zone_type}</Badge>
                  {zone.radars_count > 0 && (
                    <div className="flex items-center gap-1 mt-2 text-sm text-muted-foreground">
                      <Radio className="h-3 w-3" />
                      {zone.radars_count} radar{zone.radars_count > 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Room Modal */}
      <Dialog open={showRoomModal} onOpenChange={setShowRoomModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvelle Chambre</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Numéro de chambre *</Label>
                <Input
                  value={roomForm.room_number}
                  onChange={(e) => setRoomForm(prev => ({ ...prev, room_number: e.target.value }))}
                  placeholder="Ex: 101, A-201"
                />
              </div>
              <div className="space-y-2">
                <Label>Nom (optionnel)</Label>
                <Input
                  value={roomForm.name}
                  onChange={(e) => setRoomForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Ex: Chambre Dupont"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type de chambre</Label>
                <Select 
                  value={roomForm.room_type} 
                  onValueChange={(v) => setRoomForm(prev => ({ 
                    ...prev, 
                    room_type: v,
                    capacity: v === 'DOUBLE' || v === 'SUITE' ? 2 : 1
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SINGLE">Simple</SelectItem>
                    <SelectItem value="DOUBLE">Double</SelectItem>
                    <SelectItem value="SUITE">Suite</SelectItem>
                    <SelectItem value="STUDIO">Studio</SelectItem>
                    <SelectItem value="OTHER">Autre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Capacité</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={roomForm.capacity}
                  onChange={(e) => setRoomForm(prev => ({ ...prev, capacity: parseInt(e.target.value) || 1 }))}
                />
              </div>
            </div>
            
            <div className="space-y-3">
              <Label>Espaces à créer automatiquement</Label>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="create-bathroom"
                    checked={roomForm.create_bathroom}
                    onCheckedChange={(checked) => setRoomForm(prev => ({ ...prev, create_bathroom: checked }))}
                  />
                  <Label htmlFor="create-bathroom" className="flex items-center gap-1 cursor-pointer">
                    <Bath className="h-4 w-4" />
                    Salle de bain
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="create-kitchenette"
                    checked={roomForm.create_kitchenette}
                    onCheckedChange={(checked) => setRoomForm(prev => ({ ...prev, create_kitchenette: checked }))}
                  />
                  <Label htmlFor="create-kitchenette" className="flex items-center gap-1 cursor-pointer">
                    <UtensilsCrossed className="h-4 w-4" />
                    Kitchenette
                  </Label>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                La chambre à coucher (BEDROOM) est toujours créée par défaut
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRoomModal(false)}>
              Annuler
            </Button>
            <Button onClick={handleCreateRoom} disabled={creating}>
              {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default FloorDetailPage;
