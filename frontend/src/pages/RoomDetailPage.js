import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import api from '@/lib/api';
import { roomContactsAPI } from '@/lib/api';
import { LocationBreadcrumb } from '@/components/LocationBreadcrumb';
import {
  DoorOpen, Plus, ArrowLeft, Radio, Trash2, Bath, UtensilsCrossed, Bed, Sofa,
  MoreHorizontal, Loader2, Link, Unlink, Users, Phone, Mail, MessageCircle,
  ChevronUp, ChevronDown, UserPlus, AlertTriangle, Send, Edit2
} from 'lucide-react';

const RELATIONSHIP_LABELS = {
  FAMILY: 'Famille',
  DOCTOR: 'Médecin',
  NURSE: 'Infirmier(e)',
  CAREGIVER: 'Aide-soignant(e)',
  OTHER: 'Autre'
};

const RELATIONSHIP_COLORS = {
  FAMILY: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  DOCTOR: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  NURSE: 'bg-green-500/10 text-green-600 border-green-500/20',
  CAREGIVER: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  OTHER: 'bg-gray-500/10 text-gray-600 border-gray-500/20'
};

const CHANNEL_INFO = {
  SMS: { label: 'SMS', icon: Phone, color: 'text-green-600' },
  WHATSAPP: { label: 'WhatsApp', icon: MessageCircle, color: 'text-emerald-600' },
  TELEGRAM: { label: 'Telegram', icon: Send, color: 'text-blue-500' },
  EMAIL: { label: 'Email', icon: Mail, color: 'text-orange-500' }
};

const EMPTY_CONTACT_FORM = {
  full_name: '',
  relationship: 'FAMILY',
  phone: '',
  email: '',
  whatsapp_number: '',
  telegram_chat_id: '',
  preferred_channels: ['SMS'],
  escalation_delay_minutes: 3,
  notes: ''
};

export function RoomDetailPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('spaces');

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

  // Contacts state
  const [contacts, setContacts] = useState([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [contactForm, setContactForm] = useState({ ...EMPTY_CONTACT_FORM });
  const [savingContact, setSavingContact] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const roomRes = await api.get(`/rooms/${roomId}`);
      setRoom(roomRes.data);

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

  const fetchContacts = useCallback(async () => {
    setContactsLoading(true);
    try {
      const res = await roomContactsAPI.list(roomId);
      setContacts(res.data);
    } catch (error) {
      console.error('Failed to fetch contacts:', error);
    } finally {
      setContactsLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    fetchData();
    fetchContacts();
  }, [fetchData, fetchContacts]);

  // ==================== SPACE HANDLERS ====================

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
    if (!selectedRadar) { toast.error('Sélectionnez un radar'); return; }
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

  // ==================== CONTACT HANDLERS ====================

  const openAddContact = () => {
    setEditingContact(null);
    setContactForm({ ...EMPTY_CONTACT_FORM });
    setShowContactModal(true);
  };

  const openEditContact = (contact) => {
    setEditingContact(contact);
    setContactForm({
      full_name: contact.full_name || '',
      relationship: contact.relationship || 'FAMILY',
      phone: contact.phone || '',
      email: contact.email || '',
      whatsapp_number: contact.whatsapp_number || '',
      telegram_chat_id: contact.telegram_chat_id || '',
      preferred_channels: contact.preferred_channels || ['SMS'],
      escalation_delay_minutes: contact.escalation_delay_minutes || 3,
      notes: contact.notes || ''
    });
    setShowContactModal(true);
  };

  const handleSaveContact = async () => {
    if (!contactForm.full_name.trim()) {
      toast.error('Le nom est requis');
      return;
    }
    if (contactForm.preferred_channels.length === 0) {
      toast.error('Sélectionnez au moins un canal de notification');
      return;
    }

    setSavingContact(true);
    try {
      if (editingContact) {
        await roomContactsAPI.update(editingContact.id, contactForm);
        toast.success('Contact mis à jour');
      } else {
        await roomContactsAPI.create(roomId, contactForm);
        toast.success('Contact ajouté');
      }
      setShowContactModal(false);
      fetchContacts();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erreur');
    } finally {
      setSavingContact(false);
    }
  };

  const handleDeleteContact = async (contactId) => {
    if (!window.confirm('Supprimer ce contact d\'urgence ?')) return;
    try {
      await roomContactsAPI.delete(contactId);
      toast.success('Contact supprimé');
      fetchContacts();
    } catch (error) {
      toast.error('Erreur lors de la suppression');
    }
  };

  const handleMoveContact = async (contactId, direction) => {
    const idx = contacts.findIndex(c => c.id === contactId);
    if (idx < 0) return;
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= contacts.length) return;

    const reordered = [...contacts];
    [reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]];
    setContacts(reordered);

    try {
      await roomContactsAPI.reorder(roomId, reordered.map(c => c.id));
    } catch (error) {
      toast.error('Erreur lors du réordonnancement');
      fetchContacts();
    }
  };

  const toggleChannel = (channel) => {
    setContactForm(prev => {
      const channels = prev.preferred_channels.includes(channel)
        ? prev.preferred_channels.filter(c => c !== channel)
        : [...prev.preferred_channels, channel];
      return { ...prev, preferred_channels: channels };
    });
  };

  // ==================== HELPERS ====================

  const getSpaceIcon = (type) => {
    switch (type) {
      case 'BEDROOM': return <Bed className="h-5 w-5" />;
      case 'BATHROOM': return <Bath className="h-5 w-5" />;
      case 'KITCHENETTE': return <UtensilsCrossed className="h-5 w-5" />;
      case 'LIVING': return <Sofa className="h-5 w-5" />;
      default: return <MoreHorizontal className="h-5 w-5" />;
    }
  };

  const getSpaceLabel = (type) => {
    const labels = { BEDROOM: 'Chambre à coucher', BATHROOM: 'Salle de bain', KITCHENETTE: 'Kitchenette', LIVING: 'Salon', BALCONY: 'Balcon', OTHER: 'Autre' };
    return labels[type] || type;
  };

  const getRoomTypeLabel = (type) => {
    const labels = { SINGLE: 'Chambre simple', DOUBLE: 'Chambre double', SUITE: 'Suite', STUDIO: 'Studio', OTHER: 'Autre' };
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
      {/* Breadcrumb */}
      <LocationBreadcrumb
        items={[
          { type: 'organisation', label: room.client_name || 'Organisation', href: `/organisations/${room.client_id}` },
          { type: 'building', label: room.building_name || 'Bâtiment', href: `/buildings/${room.building_id}` },
          { type: 'floor', label: room.floor_name || 'Étage', href: `/floors/${room.floor_id}` },
          { type: 'room', label: room.room_number ? `Chambre ${room.room_number}` : (room.name || 'Chambre'), href: null }
        ]}
      />

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
            <h1 className="text-3xl font-bold tracking-tight">
              {room.room_number ? `Chambre ${room.room_number}` : (room.name || 'Chambre')}
            </h1>
            <p className="text-muted-foreground">
              {getRoomTypeLabel(room.room_type)} • {room.spaces_count} espaces • {room.radars_count} radars
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'spaces' && (
            <>
              <Button variant="outline" onClick={() => { setSelectedSpace(null); setShowAssignModal(true); }}>
                <Link className="h-4 w-4 mr-2" />
                Affecter un radar
              </Button>
              <Button onClick={() => setShowSpaceModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Ajouter un espace
              </Button>
            </>
          )}
          {activeTab === 'contacts' && (
            <Button onClick={openAddContact}>
              <UserPlus className="h-4 w-4 mr-2" />
              Ajouter un contact
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="spaces" className="gap-2">
            <Bed className="h-4 w-4" />
            Espaces
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{spaces.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="contacts" className="gap-2">
            <Users className="h-4 w-4" />
            Contacts d'urgence
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{contacts.length}</Badge>
          </TabsTrigger>
        </TabsList>

        {/* ==================== SPACES TAB ==================== */}
        <TabsContent value="spaces">
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
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Espace</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Radar</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {spaces.map((space) => (
                        <TableRow key={space.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getSpaceIcon(space.space_type)}
                              <span className="font-medium">{space.name || getSpaceLabel(space.space_type)}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{getSpaceLabel(space.space_type)}</Badge>
                          </TableCell>
                          <TableCell>
                            {space.has_radar && space.radar ? (
                              <div className="flex items-center gap-2">
                                <Radio className="h-4 w-4 text-primary" />
                                <span>{space.radar.name || space.radar.device_id?.substring(0, 15)}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">Non affecté</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {space.has_radar && space.radar ? (
                              <Badge variant="outline" className={space.radar.status === 'ONLINE' ? 'bg-green-500/10 text-green-500' : 'bg-gray-500/10 text-gray-500'}>
                                {space.radar.status}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-orange-500/10 text-orange-500">En attente</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {space.has_radar && space.radar ? (
                                <Button variant="ghost" size="sm" onClick={() => handleUnassignRadar(space.radar.id)} title="Désaffecter le radar">
                                  <Unlink className="h-4 w-4" />
                                </Button>
                              ) : (
                                <Button variant="ghost" size="sm" onClick={() => { setSelectedSpace(space); setShowAssignModal(true); }} title="Affecter un radar">
                                  <Link className="h-4 w-4" />
                                </Button>
                              )}
                              <Button variant="ghost" size="sm" onClick={() => handleDeleteSpace(space.id)} title="Supprimer l'espace">
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
                    {room.occupant_info && <p className="text-sm text-muted-foreground">{room.occupant_info}</p>}
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
        </TabsContent>

        {/* ==================== CONTACTS TAB ==================== */}
        <TabsContent value="contacts">
          {/* Info banner */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-200 mb-4">
            <AlertTriangle className="inline h-4 w-4 mr-1.5 -mt-0.5" />
            Les contacts d'urgence sont notifiés par ordre de priorité lors d'une détection de chute.
            Si le contact de priorité 1 ne répond pas dans le délai configuré, l'alerte est automatiquement transmise au contact suivant.
          </div>

          {contactsLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : contacts.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground mb-4">Aucun contact d'urgence configuré pour cette chambre</p>
                <Button onClick={openAddContact}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Ajouter un contact
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Contacts d'urgence
                  <Badge variant="secondary">{contacts.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Nom</TableHead>
                      <TableHead>Relation</TableHead>
                      <TableHead>Canaux</TableHead>
                      <TableHead>Téléphone</TableHead>
                      <TableHead>Délai escalade</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contacts.map((contact, idx) => (
                      <TableRow key={contact.id} className={!contact.is_active ? 'opacity-50' : ''}>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <div className="flex flex-col">
                              <Button
                                variant="ghost" size="icon" className="h-5 w-5"
                                disabled={idx === 0}
                                onClick={() => handleMoveContact(contact.id, 'up')}
                              >
                                <ChevronUp className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost" size="icon" className="h-5 w-5"
                                disabled={idx === contacts.length - 1}
                                onClick={() => handleMoveContact(contact.id, 'down')}
                              >
                                <ChevronDown className="h-3 w-3" />
                              </Button>
                            </div>
                            <span className="font-bold text-lg text-muted-foreground">{idx + 1}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <span className="font-medium">{contact.full_name}</span>
                            {contact.notes && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{contact.notes}</p>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={RELATIONSHIP_COLORS[contact.relationship]}>
                            {RELATIONSHIP_LABELS[contact.relationship] || contact.relationship}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {(contact.preferred_channels || []).map(ch => {
                              const info = CHANNEL_INFO[ch];
                              if (!info) return null;
                              const Icon = info.icon;
                              return (
                                <span key={ch} title={info.label} className={cn("p-1 rounded", info.color)}>
                                  <Icon className="h-3.5 w-3.5" />
                                </span>
                              );
                            })}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-mono">{contact.phone || '-'}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{contact.escalation_delay_minutes} min</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openEditContact(contact)} title="Modifier">
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDeleteContact(contact.id)} title="Supprimer">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* ==================== ADD/EDIT CONTACT MODAL ==================== */}
      <Dialog open={showContactModal} onOpenChange={setShowContactModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingContact ? 'Modifier le contact' : 'Ajouter un contact d\'urgence'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nom complet *</Label>
                <Input
                  value={contactForm.full_name}
                  onChange={(e) => setContactForm(prev => ({ ...prev, full_name: e.target.value }))}
                  placeholder="Jean Dupont"
                />
              </div>
              <div className="space-y-2">
                <Label>Relation</Label>
                <Select
                  value={contactForm.relationship}
                  onValueChange={(v) => setContactForm(prev => ({ ...prev, relationship: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(RELATIONSHIP_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Téléphone</Label>
                <Input
                  value={contactForm.phone}
                  onChange={(e) => setContactForm(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="+33 6 12 34 56 78"
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={contactForm.email}
                  onChange={(e) => setContactForm(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="jean@example.com"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>WhatsApp</Label>
                <Input
                  value={contactForm.whatsapp_number}
                  onChange={(e) => setContactForm(prev => ({ ...prev, whatsapp_number: e.target.value }))}
                  placeholder="+33 6 12 34 56 78"
                />
              </div>
              <div className="space-y-2">
                <Label>Telegram Chat ID</Label>
                <Input
                  value={contactForm.telegram_chat_id}
                  onChange={(e) => setContactForm(prev => ({ ...prev, telegram_chat_id: e.target.value }))}
                  placeholder="123456789"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Canaux de notification *</Label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(CHANNEL_INFO).map(([key, info]) => {
                  const active = contactForm.preferred_channels.includes(key);
                  const Icon = info.icon;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleChannel(key)}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors",
                        active
                          ? "border-primary bg-primary/10 text-primary font-medium"
                          : "border-border bg-background text-muted-foreground hover:bg-muted"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {info.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Délai d'escalade (minutes)</Label>
              <p className="text-xs text-muted-foreground">
                Temps d'attente avant de passer au contact suivant si pas de réponse
              </p>
              <Input
                type="number"
                min={1}
                max={30}
                value={contactForm.escalation_delay_minutes}
                onChange={(e) => setContactForm(prev => ({ ...prev, escalation_delay_minutes: parseInt(e.target.value) || 3 }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={contactForm.notes}
                onChange={(e) => setContactForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Informations complémentaires..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowContactModal(false)}>Annuler</Button>
            <Button onClick={handleSaveContact} disabled={savingContact}>
              {savingContact && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingContact ? 'Enregistrer' : 'Ajouter'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== ADD SPACE MODAL ==================== */}
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
                onValueChange={(v) => setSpaceForm(prev => ({ ...prev, space_type: v, name: v !== 'OTHER' ? '' : prev.name }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BATHROOM"><span className="flex items-center gap-2"><Bath className="h-4 w-4" /> Salle de bain</span></SelectItem>
                  <SelectItem value="KITCHENETTE"><span className="flex items-center gap-2"><UtensilsCrossed className="h-4 w-4" /> Kitchenette</span></SelectItem>
                  <SelectItem value="LIVING"><span className="flex items-center gap-2"><Sofa className="h-4 w-4" /> Salon</span></SelectItem>
                  <SelectItem value="OTHER"><span className="flex items-center gap-2"><MoreHorizontal className="h-4 w-4" /> Autre</span></SelectItem>
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
            <Button variant="outline" onClick={() => setShowSpaceModal(false)}>Annuler</Button>
            <Button onClick={handleAddSpace} disabled={creating}>
              {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Ajouter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== ASSIGN RADAR MODAL ==================== */}
      <Dialog open={showAssignModal} onOpenChange={setShowAssignModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Affecter un radar{selectedSpace && ` à ${selectedSpace.name || getSpaceLabel(selectedSpace.space_type)}`}
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
                    <SelectTrigger><SelectValue placeholder="Choisir un radar..." /></SelectTrigger>
                    <SelectContent>
                      {availableRadars.map(radar => (
                        <SelectItem key={radar.id} value={radar.id}>
                          <span className="flex items-center gap-2">
                            <Radio className={cn("h-4 w-4", radar.status === 'ONLINE' ? 'text-green-500' : 'text-muted-foreground')} />
                            {radar.name || radar.device_id?.substring(0, 20)}
                            <Badge variant="outline" className="ml-2">{radar.status}</Badge>
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
                      <SelectTrigger><SelectValue placeholder="Chambre entière" /></SelectTrigger>
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
            <Button variant="outline" onClick={() => setShowAssignModal(false)}>Annuler</Button>
            <Button onClick={handleAssignRadar} disabled={assigning || !selectedRadar || availableRadars.length === 0}>
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
