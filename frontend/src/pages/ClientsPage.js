import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import api from '@/lib/api';
import { usePageActions } from '@/contexts/PageActionsContext';
import {
  Building2,
  Plus,
  Search,
  Radio,
  MapPin,
  Users,
  ChevronRight,
  Edit,
  Loader2,
  Building,
  Layers,
  Trash2
} from 'lucide-react';

export function ClientsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    legal_name: '',
    siret: '',
    contact_email: '',
    contact_phone: '',
    address: {
      street: '',
      city: '',
      postal_code: '',
      country: 'France'
    }
  });

  const fetchClients = useCallback(async () => {
    try {
      const response = await api.get('/clients');
      setClients(response.data);
    } catch (error) {
      console.error('Failed to fetch clients:', error);
      toast.error('Erreur lors du chargement des clients');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const handleCreateClient = async () => {
    if (!formData.name.trim()) {
      toast.error('Le nom du client est requis');
      return;
    }

    setCreating(true);
    try {
      const response = await api.post('/clients', formData);
      setClients(prev => [...prev, response.data]);
      setShowCreateModal(false);
      setFormData({
        name: '',
        legal_name: '',
        siret: '',
        contact_email: '',
        contact_phone: '',
        address: { street: '', city: '', postal_code: '', country: 'France' }
      });
      toast.success('Client créé avec succès');
    } catch (error) {
      toast.error('Erreur lors de la création du client');
    } finally {
      setCreating(false);
    }
  };

  const filteredClients = clients.filter(client =>
    client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    client.legal_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDeleteClient = async (clientId, clientName) => {
    if (window.confirm(`Êtes-vous sûr de vouloir supprimer "${clientName}" ?\n\nCette action supprimera définitivement :\n- Tous les bâtiments\n- Tous les étages et chambres\n- Toutes les associations utilisateurs\n\nCette action est irréversible.`)) {
      try {
        await api.delete(`/clients/${clientId}`);
        toast.success('Client supprimé avec succès');
        fetchClients();
      } catch (error) {
        toast.error(error.response?.data?.detail || 'Erreur lors de la suppression du client');
      }
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'ACTIVE':
        return <Badge className="bg-success/20 text-success">Actif</Badge>;
      case 'SUSPENDED':
        return <Badge className="bg-warning/20 text-warning">Suspendu</Badge>;
      default:
        return <Badge variant="outline">Inactif</Badge>;
    }
  };

  // Inject actions into SubNavbar
  usePageActions(
    useMemo(() => (
      <Button onClick={() => setShowCreateModal(true)} size="sm" data-testid="create-client-btn">
        <Plus className="h-4 w-4 mr-2" />
        Nouvelle Organisation
      </Button>
    ), [])
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div data-testid="clients-page" className="space-y-6">
      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher une organisation..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="search-clients"
            />
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="text-2xl font-bold">{clients.length}</div>
                <div className="text-sm text-muted-foreground">Clients</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Building className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {clients.reduce((acc, c) => acc + (c.buildings_count || 0), 0)}
                </div>
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
                <div className="text-2xl font-bold">
                  {clients.reduce((acc, c) => acc + (c.radars_count || 0), 0)}
                </div>
                <div className="text-sm text-muted-foreground">Radars</div>
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
                <div className="text-2xl font-bold">
                  {clients.reduce((acc, c) => acc + (c.active_radars_count || 0), 0)}
                </div>
                <div className="text-sm text-muted-foreground">Radars actifs</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Clients Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Bâtiments</TableHead>
                <TableHead>Radars</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredClients.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Aucun client trouvé
                  </TableCell>
                </TableRow>
              ) : (
                filteredClients.map((client) => (
                  <TableRow 
                    key={client.id} 
                    className="cursor-pointer hover:bg-accent/50"
                    onClick={() => navigate(`/clients/${client.id}`)}
                    data-testid={`client-row-${client.id}`}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <Building2 className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{client.name}</p>
                          {client.legal_name && (
                            <p className="text-xs text-muted-foreground">{client.legal_name}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(client.status)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Building className="h-4 w-4 text-muted-foreground" />
                        <span>{client.buildings_count || 0}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Radio className="h-4 w-4 text-muted-foreground" />
                        <span>
                          {client.active_radars_count || 0} / {client.radars_count || 0}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {client.contact_email && (
                          <p className="text-muted-foreground">{client.contact_email}</p>
                        )}
                        {client.address?.city && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {client.address.city}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/clients/${client.id}`);
                          }}
                          title="Voir le client"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteClient(client.id, client.name);
                          }}
                          title="Supprimer le client"
                          data-testid={`delete-client-${client.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Client Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nouveau Client</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nom du client *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Ex: EHPAD Les Jardins"
                data-testid="client-name-input"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Raison sociale</Label>
              <Input
                value={formData.legal_name}
                onChange={(e) => setFormData(prev => ({ ...prev, legal_name: e.target.value }))}
                placeholder="Raison sociale légale"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>SIRET</Label>
                <Input
                  value={formData.siret}
                  onChange={(e) => setFormData(prev => ({ ...prev, siret: e.target.value }))}
                  placeholder="14 chiffres"
                />
              </div>
              <div className="space-y-2">
                <Label>Email contact</Label>
                <Input
                  type="email"
                  value={formData.contact_email}
                  onChange={(e) => setFormData(prev => ({ ...prev, contact_email: e.target.value }))}
                  placeholder="contact@example.com"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Adresse</Label>
              <Input
                value={formData.address.street}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  address: { ...prev.address, street: e.target.value }
                }))}
                placeholder="Rue"
                className="mb-2"
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={formData.address.city}
                  onChange={(e) => setFormData(prev => ({ 
                    ...prev, 
                    address: { ...prev.address, city: e.target.value }
                  }))}
                  placeholder="Ville"
                />
                <Input
                  value={formData.address.postal_code}
                  onChange={(e) => setFormData(prev => ({ 
                    ...prev, 
                    address: { ...prev.address, postal_code: e.target.value }
                  }))}
                  placeholder="Code postal"
                />
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Annuler
            </Button>
            <Button onClick={handleCreateClient} disabled={creating}>
              {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ClientsPage;
