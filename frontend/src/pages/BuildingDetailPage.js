import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import api from '@/lib/api';
import { LocationBreadcrumb } from '@/components/LocationBreadcrumb';
import {
  Building,
  Layers,
  DoorOpen,
  Plus,
  ArrowLeft,
  Radio,
  MapPin,
  Edit,
  Trash2,
  ChevronRight,
  Loader2,
  MoreHorizontal
} from 'lucide-react';

export function BuildingDetailPage() {
  const { buildingId } = useParams();
  const navigate = useNavigate();
  
  const [building, setBuilding] = useState(null);
  const [floors, setFloors] = useState([]);
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Floor modal
  const [showFloorModal, setShowFloorModal] = useState(false);
  const [floorForm, setFloorForm] = useState({ name: '', index: 0 });
  
  // Zone modal
  const [showZoneModal, setShowZoneModal] = useState(false);
  const [zoneForm, setZoneForm] = useState({ name: '', zone_type: 'CORRIDOR', floor_id: '' });
  
  const [creating, setCreating] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [buildingRes, floorsRes, zonesRes] = await Promise.all([
        api.get(`/buildings/${buildingId}`),
        api.get(`/buildings/${buildingId}/floors`),
        api.get(`/buildings/${buildingId}/zones`)
      ]);
      
      setBuilding(buildingRes.data);
      setFloors(floorsRes.data);
      setZones(zonesRes.data);
    } catch (error) {
      console.error('Failed to fetch building data:', error);
      toast.error('Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  }, [buildingId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreateFloor = async () => {
    if (!floorForm.name.trim()) {
      toast.error('Le nom de l\'étage est requis');
      return;
    }

    setCreating(true);
    try {
      await api.post(`/buildings/${buildingId}/floors`, floorForm);
      setShowFloorModal(false);
      setFloorForm({ name: '', index: floors.length });
      toast.success('Étage créé');
      fetchData();
    } catch (error) {
      toast.error('Erreur lors de la création');
    } finally {
      setCreating(false);
    }
  };

  const handleCreateZone = async () => {
    if (!zoneForm.name.trim()) {
      toast.error('Le nom de la zone est requis');
      return;
    }

    setCreating(true);
    try {
      await api.post(`/buildings/${buildingId}/zones`, {
        ...zoneForm,
        floor_id: zoneForm.floor_id || null
      });
      setShowZoneModal(false);
      setZoneForm({ name: '', zone_type: 'CORRIDOR', floor_id: '' });
      toast.success('Zone créée');
      fetchData();
    } catch (error) {
      toast.error('Erreur lors de la création');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteFloor = async (floorId) => {
    if (!window.confirm('Supprimer cet étage et tout son contenu ?')) return;
    
    try {
      await api.delete(`/floors/${floorId}`);
      toast.success('Étage supprimé');
      fetchData();
    } catch (error) {
      toast.error('Erreur lors de la suppression');
    }
  };

  const handleDeleteZone = async (zoneId) => {
    if (!window.confirm('Supprimer cette zone ?')) return;
    
    try {
      await api.delete(`/zones/${zoneId}`);
      toast.success('Zone supprimée');
      fetchData();
    } catch (error) {
      toast.error('Erreur lors de la suppression');
    }
  };

  const getZoneTypeLabel = (type) => {
    const labels = {
      CORRIDOR: 'Couloir',
      COMMON: 'Espace commun',
      LOBBY: 'Hall',
      STAIR: 'Escalier',
      ELEVATOR: 'Ascenseur',
      OUTDOOR: 'Extérieur',
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

  if (!building) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <p className="text-muted-foreground">Bâtiment non trouvé</p>
        <Button onClick={() => navigate(-1)}>Retour</Button>
      </div>
    );
  }

  return (
    <div data-testid="building-detail-page" className="space-y-6">
      {/* Breadcrumb */}
      <LocationBreadcrumb 
        items={[
          { type: 'organisation', label: building.client_name || 'Organisation', href: `/organisations/${building.client_id}` },
          { type: 'building', label: building.name, href: null }
        ]} 
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/organisations/${building.client_id}`)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="p-3 rounded-lg bg-blue-500/10">
            <Building className="h-6 w-6 text-blue-500" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{building.name}</h1>
            <p className="text-muted-foreground">
              {building.floors_count} étages • {building.rooms_count} chambres • {building.radars_count || 0} capteurs
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowZoneModal(true)}>
            <MapPin className="h-4 w-4 mr-2" />
            Nouvelle Zone
          </Button>
          <Button onClick={() => setShowFloorModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nouvel Étage
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Layers className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <div className="text-2xl font-bold">{floors.length}</div>
                <div className="text-sm text-muted-foreground">Étages</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <DoorOpen className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <div className="text-2xl font-bold">{building.rooms_count || 0}</div>
                <div className="text-sm text-muted-foreground">Chambres</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <MapPin className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <div className="text-2xl font-bold">{zones.length}</div>
                <div className="text-sm text-muted-foreground">Zones</div>
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
                <div className="text-2xl font-bold">{building.radars_count || 0}</div>
                <div className="text-sm text-muted-foreground">Radars</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Floors */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5" />
                Étages
              </CardTitle>
              <Button size="sm" onClick={() => setShowFloorModal(true)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {floors.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <Layers className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Aucun étage</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Étage</TableHead>
                    <TableHead>Chambres</TableHead>
                    <TableHead>Radars</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {floors.sort((a, b) => a.index - b.index).map((floor) => (
                    <TableRow 
                      key={floor.id}
                      className="cursor-pointer hover:bg-accent/50"
                      onClick={() => navigate(`/floors/${floor.id}`)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{floor.index}</Badge>
                          <span className="font-medium">{floor.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>{floor.rooms_count || 0}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Radio className="h-3 w-3" />
                          {floor.radars_count || 0}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteFloor(floor.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Zones */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Zones communes
              </CardTitle>
              <Button size="sm" onClick={() => setShowZoneModal(true)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {zones.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <MapPin className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Aucune zone</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Zone</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Étage</TableHead>
                    <TableHead>Radars</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {zones.map((zone) => (
                    <TableRow key={zone.id}>
                      <TableCell className="font-medium">{zone.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{getZoneTypeLabel(zone.zone_type)}</Badge>
                      </TableCell>
                      <TableCell>
                        {zone.floor_id 
                          ? floors.find(f => f.id === zone.floor_id)?.name || '-'
                          : 'Bâtiment'
                        }
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Radio className="h-3 w-3" />
                          {zone.radars_count || 0}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleDeleteZone(zone.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Building Info */}
      {(building.contact_name || building.contact_email || building.address) && (
        <Card>
          <CardHeader>
            <CardTitle>Contact & Adresse</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {building.contact_name && (
                <div>
                  <Label className="text-muted-foreground text-xs">Contact</Label>
                  <p className="font-medium">{building.contact_name}</p>
                </div>
              )}
              {building.contact_email && (
                <div>
                  <Label className="text-muted-foreground text-xs">Email</Label>
                  <p>{building.contact_email}</p>
                </div>
              )}
              {building.address && (
                <div>
                  <Label className="text-muted-foreground text-xs">Adresse</Label>
                  <p>{building.address.street}</p>
                  <p>{building.address.postal_code} {building.address.city}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Floor Modal */}
      <Dialog open={showFloorModal} onOpenChange={setShowFloorModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvel Étage</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nom de l'étage *</Label>
              <Input
                value={floorForm.name}
                onChange={(e) => setFloorForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Ex: Rez-de-chaussée, 1er étage"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Index (ordre)</Label>
              <Input
                type="number"
                value={floorForm.index}
                onChange={(e) => setFloorForm(prev => ({ ...prev, index: parseInt(e.target.value) || 0 }))}
                placeholder="0 = RDC, -1 = sous-sol"
              />
              <p className="text-xs text-muted-foreground">
                Utilisez -1 pour sous-sol, 0 pour RDC, 1+ pour étages supérieurs
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFloorModal(false)}>
              Annuler
            </Button>
            <Button onClick={handleCreateFloor} disabled={creating}>
              {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Zone Modal */}
      <Dialog open={showZoneModal} onOpenChange={setShowZoneModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvelle Zone</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nom de la zone *</Label>
              <Input
                value={zoneForm.name}
                onChange={(e) => setZoneForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Ex: Couloir principal, Hall d'entrée"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Type de zone</Label>
              <Select 
                value={zoneForm.zone_type} 
                onValueChange={(v) => setZoneForm(prev => ({ ...prev, zone_type: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CORRIDOR">Couloir</SelectItem>
                  <SelectItem value="COMMON">Espace commun</SelectItem>
                  <SelectItem value="LOBBY">Hall d'entrée</SelectItem>
                  <SelectItem value="STAIR">Escalier</SelectItem>
                  <SelectItem value="ELEVATOR">Ascenseur</SelectItem>
                  <SelectItem value="OUTDOOR">Extérieur</SelectItem>
                  <SelectItem value="OTHER">Autre</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Étage (optionnel)</Label>
              <Select 
                value={zoneForm.floor_id || "building-level"} 
                onValueChange={(v) => setZoneForm(prev => ({ ...prev, floor_id: v === "building-level" ? "" : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Zone au niveau bâtiment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="building-level">Niveau bâtiment</SelectItem>
                  {floors.map(floor => (
                    <SelectItem key={floor.id} value={floor.id}>{floor.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowZoneModal(false)}>
              Annuler
            </Button>
            <Button onClick={handleCreateZone} disabled={creating}>
              {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default BuildingDetailPage;
