/**
 * Sites & Bâtiments Page
 * 
 * Affiche l'arborescence complète :
 * Organisation → Bâtiment → Étage → Zone → Chambre → Espace → Capteur
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Building2,
  Layers,
  ChevronRight,
  ChevronDown,
  Home,
  DoorOpen,
  Radio,
  Search,
  MapPin,
  Users,
  Loader2,
  RefreshCw,
  Building,
  LayoutGrid
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Tree Node Component
function TreeNode({ node, level = 0, onSelect, selectedId }) {
  const [expanded, setExpanded] = useState(level < 2);
  const hasChildren = node.children && node.children.length > 0;
  const navigate = useNavigate();
  
  const getIcon = () => {
    switch (node.type) {
      case 'organisation': return <Building2 className="h-4 w-4 text-blue-500" />;
      case 'building': return <Building className="h-4 w-4 text-emerald-500" />;
      case 'floor': return <Layers className="h-4 w-4 text-amber-500" />;
      case 'zone': return <LayoutGrid className="h-4 w-4 text-purple-500" />;
      case 'room': return <DoorOpen className="h-4 w-4 text-cyan-500" />;
      case 'space': return <Home className="h-4 w-4 text-pink-500" />;
      case 'sensor': return <Radio className="h-4 w-4 text-red-500" />;
      default: return <ChevronRight className="h-4 w-4" />;
    }
  };
  
  const getTypeLabel = () => {
    switch (node.type) {
      case 'organisation': return 'Organisation';
      case 'building': return 'Bâtiment';
      case 'floor': return 'Étage';
      case 'zone': return 'Zone';
      case 'room': return 'Chambre';
      case 'space': return 'Espace';
      case 'sensor': return 'Capteur';
      default: return '';
    }
  };
  
  const handleClick = () => {
    if (hasChildren) {
      setExpanded(!expanded);
    }
    onSelect?.(node);
    
    // Navigation vers la page de détail
    switch (node.type) {
      case 'organisation':
        navigate(`/organisations/${node.id}`);
        break;
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
  
  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer transition-colors',
          'hover:bg-muted/50',
          selectedId === node.id && 'bg-primary/10 border-l-2 border-primary'
        )}
        style={{ paddingLeft: `${level * 20 + 8}px` }}
        onClick={handleClick}
      >
        {hasChildren ? (
          <button 
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className="p-0.5 hover:bg-muted rounded"
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
        ) : (
          <span className="w-5" />
        )}
        
        {getIcon()}
        
        <span className="flex-1 truncate font-medium text-sm">
          {node.name}
        </span>
        
        {node.sensors_count > 0 && (
          <Badge variant="secondary" className="text-xs">
            <Radio className="h-3 w-3 mr-1" />
            {node.sensors_count}
          </Badge>
        )}
        
        {node.status && (
          <Badge 
            variant={node.status === 'ONLINE' ? 'default' : 'secondary'}
            className={cn(
              'text-xs',
              node.status === 'ONLINE' && 'bg-green-500'
            )}
          >
            {node.status}
          </Badge>
        )}
      </div>
      
      {expanded && hasChildren && (
        <div>
          {node.children.map((child, idx) => (
            <TreeNode 
              key={child.id || idx} 
              node={child} 
              level={level + 1}
              onSelect={onSelect}
              selectedId={selectedId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Stats Card Component
function StatsCard({ icon: Icon, label, value, color }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
      <div className={cn('p-2 rounded-lg', color)}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export function SitesBatimentsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  
  const [organisations, setOrganisations] = useState([]);
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [treeData, setTreeData] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Charger les organisations
  useEffect(() => {
    fetchOrganisations();
  }, []);
  
  // Charger l'arborescence quand une organisation est sélectionnée
  useEffect(() => {
    if (selectedOrg) {
      fetchTree(selectedOrg);
      fetchStats(selectedOrg);
    }
  }, [selectedOrg]);
  
  const fetchOrganisations = async () => {
    try {
      const response = await api.get('/organisations');
      setOrganisations(response.data);
      if (response.data.length > 0) {
        setSelectedOrg(response.data[0].id);
      }
    } catch (error) {
      toast.error('Erreur lors du chargement des organisations');
    } finally {
      setLoading(false);
    }
  };
  
  const fetchTree = async (orgId) => {
    try {
      setLoading(true);
      const response = await api.get(`/organisations/${orgId}/tree`);
      
      // Transformer les données en format arborescence
      const tree = transformToTree(response.data);
      setTreeData(tree);
    } catch (error) {
      console.error('Erreur lors du chargement de l\'arborescence:', error);
      toast.error('Erreur lors du chargement de l\'arborescence');
    } finally {
      setLoading(false);
    }
  };
  
  const fetchStats = async (orgId) => {
    try {
      const response = await api.get(`/organisations/${orgId}/stats`);
      setStats(response.data);
    } catch (error) {
      console.error('Erreur lors du chargement des stats:', error);
    }
  };
  
  const transformToTree = (data) => {
    // data contient: buildings avec floors, rooms, zones, etc.
    const org = organisations.find(o => o.id === selectedOrg);
    if (!org) return [];
    
    const orgNode = {
      id: org.id,
      name: org.name,
      type: 'organisation',
      children: []
    };
    
    // Ajouter les bâtiments
    if (data.buildings) {
      orgNode.children = data.buildings.map(building => ({
        id: building.id,
        name: building.name,
        type: 'building',
        sensors_count: building.sensors_count || 0,
        children: (building.floors || []).map(floor => ({
          id: floor.id,
          name: floor.name,
          type: 'floor',
          sensors_count: floor.sensors_count || 0,
          children: [
            // Zones de l'étage
            ...(floor.zones || []).map(zone => ({
              id: zone.id,
              name: zone.name,
              type: 'zone',
              sensors_count: zone.sensors_count || 0,
              children: (zone.rooms || []).map(room => ({
                id: room.id,
                name: room.name,
                type: 'room',
                sensors_count: room.sensors_count || 0,
                children: (room.spaces || []).map(space => ({
                  id: space.id,
                  name: space.name,
                  type: 'space',
                  children: (space.sensors || []).map(sensor => ({
                    id: sensor.id,
                    name: sensor.name || sensor.serial_product,
                    type: 'sensor',
                    status: sensor.status
                  }))
                }))
              }))
            })),
            // Chambres sans zone
            ...(floor.rooms || []).filter(r => !r.zone_id).map(room => ({
              id: room.id,
              name: room.name,
              type: 'room',
              sensors_count: room.sensors_count || 0,
              children: (room.spaces || []).map(space => ({
                id: space.id,
                name: space.name,
                type: 'space',
                children: (space.sensors || []).map(sensor => ({
                  id: sensor.id,
                  name: sensor.name || sensor.serial_product,
                  type: 'sensor',
                  status: sensor.status
                }))
              }))
            }))
          ]
        }))
      }));
    }
    
    return [orgNode];
  };
  
  const handleRefresh = () => {
    if (selectedOrg) {
      fetchTree(selectedOrg);
      fetchStats(selectedOrg);
    }
  };
  
  if (loading && organisations.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Sites & Bâtiments</h1>
          <p className="text-muted-foreground">
            Gérez la structure hiérarchique de vos installations
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Select value={selectedOrg || ''} onValueChange={setSelectedOrg}>
            <SelectTrigger className="w-[250px]">
              <SelectValue placeholder="Sélectionner une organisation" />
            </SelectTrigger>
            <SelectContent>
              {organisations.map(org => (
                <SelectItem key={org.id} value={org.id}>
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    {org.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Button variant="outline" size="icon" onClick={handleRefresh}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>
      
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatsCard 
            icon={Building} 
            label="Bâtiments" 
            value={stats.buildings_count} 
            color="bg-emerald-500"
          />
          <StatsCard 
            icon={Layers} 
            label="Étages" 
            value={stats.floors_count} 
            color="bg-amber-500"
          />
          <StatsCard 
            icon={LayoutGrid} 
            label="Zones" 
            value={stats.zones_count} 
            color="bg-purple-500"
          />
          <StatsCard 
            icon={DoorOpen} 
            label="Chambres" 
            value={stats.rooms_count} 
            color="bg-cyan-500"
          />
          <StatsCard 
            icon={Radio} 
            label="Capteurs" 
            value={`${stats.sensors_online}/${stats.sensors_count}`} 
            color="bg-red-500"
          />
        </div>
      )}
      
      {/* Tree View */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Arborescence</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : treeData.length > 0 ? (
            <div className="border rounded-lg p-2 max-h-[500px] overflow-y-auto">
              {treeData.map((node, idx) => (
                <TreeNode 
                  key={node.id || idx} 
                  node={node}
                  onSelect={setSelectedNode}
                  selectedId={selectedNode?.id}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Aucune structure trouvée</p>
              <p className="text-sm">Sélectionnez une organisation pour voir son arborescence</p>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Légende */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-blue-500" />
              <span>Organisation</span>
            </div>
            <div className="flex items-center gap-2">
              <Building className="h-4 w-4 text-emerald-500" />
              <span>Bâtiment</span>
            </div>
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-amber-500" />
              <span>Étage</span>
            </div>
            <div className="flex items-center gap-2">
              <LayoutGrid className="h-4 w-4 text-purple-500" />
              <span>Zone</span>
            </div>
            <div className="flex items-center gap-2">
              <DoorOpen className="h-4 w-4 text-cyan-500" />
              <span>Chambre</span>
            </div>
            <div className="flex items-center gap-2">
              <Home className="h-4 w-4 text-pink-500" />
              <span>Espace</span>
            </div>
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-red-500" />
              <span>Capteur</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default SitesBatimentsPage;
