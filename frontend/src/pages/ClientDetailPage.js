import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import api from '@/lib/api';
import {
  Building2,
  Building,
  Layers,
  DoorOpen,
  Plus,
  ChevronRight,
  ChevronDown,
  Radio,
  MapPin,
  Edit,
  Trash2,
  ArrowLeft,
  Loader2,
  TreeDeciduous,
  Table as TableIcon,
  Bath,
  UtensilsCrossed,
  Bed,
  MoreHorizontal
} from 'lucide-react';

// Tree Node Component
function TreeNode({ node, level = 0, onSelect, selectedId, expandedIds, onToggle }) {
  const isExpanded = expandedIds.includes(node.id);
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedId === node.id;
  
  const getIcon = () => {
    switch (node.type) {
      case 'building': return <Building className="h-4 w-4" />;
      case 'floor': return <Layers className="h-4 w-4" />;
      case 'room': return <DoorOpen className="h-4 w-4" />;
      case 'zone': return <MapPin className="h-4 w-4" />;
      case 'space':
        switch (node.metadata?.space_type) {
          case 'BATHROOM': return <Bath className="h-4 w-4" />;
          case 'KITCHENETTE': return <UtensilsCrossed className="h-4 w-4" />;
          case 'BEDROOM': return <Bed className="h-4 w-4" />;
          default: return <MoreHorizontal className="h-4 w-4" />;
        }
      default: return <Building2 className="h-4 w-4" />;
    }
  };
  
  const getTypeColor = () => {
    switch (node.type) {
      case 'building': return 'text-blue-500';
      case 'floor': return 'text-amber-500';
      case 'room': return 'text-green-500';
      case 'zone': return 'text-purple-500';
      case 'space': return 'text-cyan-500';
      default: return 'text-muted-foreground';
    }
  };

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer hover:bg-accent/50 transition-colors',
          isSelected && 'bg-primary/10 text-primary'
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() => onSelect(node)}
      >
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.id);
            }}
            className="p-0.5 hover:bg-accent rounded"
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        ) : (
          <span className="w-5" />
        )}
        
        <span className={getTypeColor()}>{getIcon()}</span>
        
        <span className="flex-1 truncate text-sm">{node.name}</span>
        
        {node.radars_count > 0 && (
          <Badge variant="outline" className="text-xs h-5 px-1.5">
            <Radio className="h-3 w-3 mr-1" />
            {node.radars_count}
          </Badge>
        )}
      </div>
      
      {isExpanded && hasChildren && (
        <div>
          {node.children.map(child => (
            <TreeNode
              key={child.id}
              node={child}
              level={level + 1}
              onSelect={onSelect}
              selectedId={selectedId}
              expandedIds={expandedIds}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ClientDetailPage() {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  
  const [client, setClient] = useState(null);
  const [tree, setTree] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState(null);
  const [expandedIds, setExpandedIds] = useState([]);
  const [activeTab, setActiveTab] = useState('tree');
  
  // Modal states
  const [showBuildingModal, setShowBuildingModal] = useState(false);
  const [buildingForm, setBuildingForm] = useState({ name: '', contact_name: '', contact_email: '' });
  const [creating, setCreating] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [clientRes, treeRes, buildingsRes] = await Promise.all([
        api.get(`/clients/${clientId}`),
        api.get(`/clients/${clientId}/tree`),
        api.get(`/clients/${clientId}/buildings`)
      ]);
      
      setClient(clientRes.data);
      setTree(treeRes.data);
      setBuildings(buildingsRes.data);
      
      // Auto-expand first building
      if (treeRes.data.length > 0) {
        setExpandedIds([treeRes.data[0].id]);
      }
    } catch (error) {
      console.error('Failed to fetch client data:', error);
      toast.error('Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleToggleExpand = (id) => {
    setExpandedIds(prev => 
      prev.includes(id) 
        ? prev.filter(i => i !== id)
        : [...prev, id]
    );
  };

  const handleSelectNode = (node) => {
    setSelectedNode(node);
    
    // Navigate based on type
    switch (node.type) {
      case 'building':
        navigate(`/buildings/${node.id}`);
        break;
      case 'floor':
        navigate(`/floors/${node.id}`);
        break;
      case 'room':
        navigate(`/rooms/${node.id}`);
        break;
      default:
        break;
    }
  };

  const handleCreateBuilding = async () => {
    if (!buildingForm.name.trim()) {
      toast.error('Le nom du bâtiment est requis');
      return;
    }

    setCreating(true);
    try {
      await api.post(`/clients/${clientId}/buildings`, {
        ...buildingForm,
        client_id: clientId
      });
      setShowBuildingModal(false);
      setBuildingForm({ name: '', contact_name: '', contact_email: '' });
      toast.success('Bâtiment créé');
      fetchData();
    } catch (error) {
      toast.error('Erreur lors de la création');
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <p className="text-muted-foreground">Client non trouvé</p>
        <Button onClick={() => navigate('/clients')}>Retour aux clients</Button>
      </div>
    );
  }

  return (
    <div data-testid="client-detail-page" className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/clients')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="p-3 rounded-lg bg-primary/10">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{client.name}</h1>
            <p className="text-muted-foreground">
              {client.buildings_count} bâtiment{client.buildings_count > 1 ? 's' : ''} • {client.radars_count} radar{client.radars_count > 1 ? 's' : ''}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate(`/clients/${clientId}/radars`)}>
            <Radio className="h-4 w-4 mr-2" />
            Gérer les radars
          </Button>
          <Button onClick={() => setShowBuildingModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nouveau Bâtiment
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Building className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <div className="text-2xl font-bold">{client.buildings_count || 0}</div>
                <div className="text-sm text-muted-foreground">Bâtiments</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <Radio className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <div className="text-2xl font-bold">{client.radars_count || 0}</div>
                <div className="text-sm text-muted-foreground">Radars total</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <Radio className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <div className="text-2xl font-bold">{client.active_radars_count || 0}</div>
                <div className="text-sm text-muted-foreground">Radars actifs</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Layers className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {buildings.reduce((acc, b) => acc + (b.floors_count || 0), 0)}
                </div>
                <div className="text-sm text-muted-foreground">Étages</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tree View */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <TreeDeciduous className="h-5 w-5" />
                Structure hiérarchique
              </CardTitle>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="h-8">
                  <TabsTrigger value="tree" className="h-7 px-3">
                    <TreeDeciduous className="h-4 w-4" />
                  </TabsTrigger>
                  <TabsTrigger value="table" className="h-7 px-3">
                    <TableIcon className="h-4 w-4" />
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent>
            {activeTab === 'tree' ? (
              <ScrollArea className="h-[500px]">
                {tree.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                    <Building className="h-12 w-12 mb-4 opacity-50" />
                    <p>Aucun bâtiment</p>
                    <Button 
                      variant="outline" 
                      className="mt-4"
                      onClick={() => setShowBuildingModal(true)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Créer un bâtiment
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {tree.map(node => (
                      <TreeNode
                        key={node.id}
                        node={node}
                        onSelect={handleSelectNode}
                        selectedId={selectedNode?.id}
                        expandedIds={expandedIds}
                        onToggle={handleToggleExpand}
                      />
                    ))}
                  </div>
                )}
              </ScrollArea>
            ) : (
              <ScrollArea className="h-[500px]">
                <div className="space-y-4">
                  {buildings.map(building => (
                    <Card 
                      key={building.id} 
                      className="cursor-pointer hover:bg-accent/50"
                      onClick={() => navigate(`/buildings/${building.id}`)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-blue-500/10">
                              <Building className="h-5 w-5 text-blue-500" />
                            </div>
                            <div>
                              <p className="font-medium">{building.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {building.floors_count} étages • {building.rooms_count} chambres • {building.radars_count} radars
                              </p>
                            </div>
                          </div>
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Client Info */}
        <Card>
          <CardHeader>
            <CardTitle>Informations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {client.legal_name && (
              <div>
                <Label className="text-muted-foreground text-xs">Raison sociale</Label>
                <p className="font-medium">{client.legal_name}</p>
              </div>
            )}
            
            {client.siret && (
              <div>
                <Label className="text-muted-foreground text-xs">SIRET</Label>
                <p className="font-mono">{client.siret}</p>
              </div>
            )}
            
            {client.address && (
              <div>
                <Label className="text-muted-foreground text-xs">Adresse</Label>
                <p>{client.address.street}</p>
                <p>{client.address.postal_code} {client.address.city}</p>
              </div>
            )}
            
            {client.contact_email && (
              <div>
                <Label className="text-muted-foreground text-xs">Email</Label>
                <p>{client.contact_email}</p>
              </div>
            )}
            
            {client.contact_phone && (
              <div>
                <Label className="text-muted-foreground text-xs">Téléphone</Label>
                <p>{client.contact_phone}</p>
              </div>
            )}
            
            <div>
              <Label className="text-muted-foreground text-xs">Statut</Label>
              <div className="mt-1">
                <Badge className={cn(
                  client.status === 'ACTIVE' && 'bg-success/20 text-success',
                  client.status === 'SUSPENDED' && 'bg-warning/20 text-warning'
                )}>
                  {client.status === 'ACTIVE' ? 'Actif' : 'Suspendu'}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Create Building Modal */}
      <Dialog open={showBuildingModal} onOpenChange={setShowBuildingModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouveau Bâtiment</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nom du bâtiment *</Label>
              <Input
                value={buildingForm.name}
                onChange={(e) => setBuildingForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Ex: Résidence Principale"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Contact technique</Label>
              <Input
                value={buildingForm.contact_name}
                onChange={(e) => setBuildingForm(prev => ({ ...prev, contact_name: e.target.value }))}
                placeholder="Nom du contact"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Email contact</Label>
              <Input
                type="email"
                value={buildingForm.contact_email}
                onChange={(e) => setBuildingForm(prev => ({ ...prev, contact_email: e.target.value }))}
                placeholder="email@example.com"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBuildingModal(false)}>
              Annuler
            </Button>
            <Button onClick={handleCreateBuilding} disabled={creating}>
              {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ClientDetailPage;
