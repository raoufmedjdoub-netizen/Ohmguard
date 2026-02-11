/**
 * EventActionDialog - Shared dialog for ACK/Resolve/False Alarm/Assign actions
 * Used by GlobalAlertBanner, LivePage, and EventDetailPage.
 * 
 * Features:
 * - Comment field (required for RESOLVED/FALSE_ALARM)
 * - User assignment dropdown
 * - CC admin checkbox for assignment notifications
 */
import React, { useState, useEffect } from 'react';
import api, { usersAPI } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, CheckCircle, XCircle, Clock, UserPlus } from 'lucide-react';

const ACTION_CONFIG = {
  ACK: {
    title: 'Acquitter l\'alerte',
    description: 'Indiquez que vous avez pris connaissance de cette alerte.',
    buttonLabel: 'Acquitter',
    buttonClass: 'bg-blue-600 hover:bg-blue-700',
    icon: Clock,
    commentRequired: false,
  },
  RESOLVED: {
    title: 'Resoudre l\'alerte',
    description: 'Marquer cette alerte comme resolue. Un commentaire est obligatoire.',
    buttonLabel: 'Resoudre',
    buttonClass: 'bg-green-600 hover:bg-green-700',
    icon: CheckCircle,
    commentRequired: true,
  },
  FALSE_ALARM: {
    title: 'Marquer comme fausse alarme',
    description: 'Signaler cette alerte comme fausse alarme. Un commentaire est obligatoire.',
    buttonLabel: 'Fausse alarme',
    buttonClass: 'bg-gray-600 hover:bg-gray-700',
    icon: XCircle,
    commentRequired: true,
  },
  ASSIGN: {
    title: 'Assigner l\'alerte',
    description: 'Assigner cette alerte a un utilisateur. Il recevra une notification par email.',
    buttonLabel: 'Assigner',
    buttonClass: 'bg-purple-600 hover:bg-purple-700',
    icon: UserPlus,
    commentRequired: false,
  },
};

export function EventActionDialog({ open, onOpenChange, eventId, action, eventInfo, onSuccess }) {
  const [comment, setComment] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [ccAdmin, setCcAdmin] = useState(false);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const config = ACTION_CONFIG[action] || ACTION_CONFIG.ACK;
  const showAssignment = action === 'ASSIGN' || action === 'ACK';
  const Icon = config.icon;

  // Load assignable users
  useEffect(() => {
    if (!open || !showAssignment) return;
    setLoadingUsers(true);
    usersAPI.assignable()
      .then(res => setUsers(res.data || []))
      .catch(() => setUsers([]))
      .finally(() => setLoadingUsers(false));
  }, [open, showAssignment]);

  // Reset form on open
  useEffect(() => {
    if (open) {
      setComment('');
      setAssignedTo('');
      setCcAdmin(false);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (config.commentRequired && !comment.trim()) {
      toast.error('Le commentaire est obligatoire pour cette action');
      return;
    }
    if (action === 'ASSIGN' && !assignedTo) {
      toast.error('Veuillez selectionner un utilisateur');
      return;
    }

    setLoading(true);
    try {
      const payload = {};
      if (action !== 'ASSIGN') {
        payload.status = action;
      }
      if (comment.trim()) {
        payload.comment = comment.trim();
      }
      if (assignedTo) {
        payload.assigned_to = assignedTo;
        const user = users.find(u => u.id === assignedTo);
        if (user) payload.assigned_to_name = user.full_name;
      }
      if (ccAdmin) {
        payload.cc_admin = true;
      }

      let res;
      if (eventInfo?.isAI) {
        // AI events use a different endpoint
        const aiStatus = action === 'ACK' ? 'ACKNOWLEDGED' : action;
        res = await api.patch(`/ai-events/${eventId}/status?status=${aiStatus}`);
        // Return a normalized object for onSuccess
        res = { data: { id: eventId, status: aiStatus, ...payload } };
      } else {
        res = await api.patch(`/events/${eventId}`, payload);
      }
      toast.success(action === 'ASSIGN' ? 'Alerte assignee' : `Alerte ${config.buttonLabel.toLowerCase()}`);
      onSuccess?.(res.data);
      onOpenChange(false);
    } catch (e) {
      console.error('EventActionDialog error:', e, 'eventInfo:', eventInfo, 'eventId:', eventId, 'action:', action);
      const msg = e.response?.data?.detail || 'Erreur lors de la mise a jour';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="event-action-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5" />
            {config.title}
          </DialogTitle>
          <DialogDescription>{config.description}</DialogDescription>
        </DialogHeader>

        {/* Event info summary */}
        {eventInfo && (
          <div className="flex flex-wrap gap-2 py-2 px-1 bg-muted/30 rounded-md" data-testid="event-info-summary">
            <Badge variant="outline">{eventInfo.type || 'FALL'}</Badge>
            {eventInfo.location && <span className="text-sm text-muted-foreground">{eventInfo.location}</span>}
            {eventInfo.sensor && <span className="text-sm font-mono text-muted-foreground">{eventInfo.sensor}</span>}
          </div>
        )}

        <div className="space-y-4 py-2">
          {/* Assignment dropdown */}
          {showAssignment && (
            <div className="space-y-2">
              <Label htmlFor="assign-user">Assigner a</Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger data-testid="assign-user-select">
                  <SelectValue placeholder={loadingUsers ? "Chargement..." : "Selectionner un utilisateur"} />
                </SelectTrigger>
                <SelectContent>
                  {users.map(u => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.full_name} ({u.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {assignedTo && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="cc-admin"
                    checked={ccAdmin}
                    onCheckedChange={setCcAdmin}
                    data-testid="cc-admin-checkbox"
                  />
                  <Label htmlFor="cc-admin" className="text-sm text-muted-foreground cursor-pointer">
                    Mettre en copie l'admin du site
                  </Label>
                </div>
              )}
            </div>
          )}

          {/* Comment field */}
          <div className="space-y-2">
            <Label htmlFor="comment">
              Commentaire {config.commentRequired && <span className="text-red-500">*</span>}
            </Label>
            <Textarea
              id="comment"
              data-testid="action-comment-input"
              placeholder={config.commentRequired ? "Commentaire obligatoire..." : "Commentaire optionnel..."}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading} data-testid="cancel-action-btn">
            Annuler
          </Button>
          <Button
            className={config.buttonClass}
            onClick={handleSubmit}
            disabled={loading}
            data-testid="confirm-action-btn"
          >
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {config.buttonLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
