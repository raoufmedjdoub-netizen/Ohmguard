import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { rulesAPI, sitesAPI } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Switch } from '../ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';
import { toast } from 'sonner';
import {
  Bell,
  Plus,
  Trash2,
  Settings,
  Loader2,
  AlertTriangle,
  Mail,
  Webhook,
  Clock
} from 'lucide-react';

export function RulesPage() {
  const { t } = useTranslation();
  const { canManageRules, user } = useAuth();
  const [rules, setRules] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newRule, setNewRule] = useState({
    name: '',
    site_id: '',
    event_types: ['FALL'],
    min_severity: 'HIGH',
    channels: ['in_app'],
    webhook_url: '',
    escalation_minutes: 5,
    escalation_group: '',
    is_active: true
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [rulesRes, sitesRes] = await Promise.all([
        rulesAPI.list(),
        sitesAPI.list()
      ]);
      setRules(rulesRes.data);
      setSites(sitesRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error(t('errors.generic'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateRule = async () => {
    try {
      await rulesAPI.create({
        ...newRule,
        tenant_id: user?.tenant_id,
        site_id: newRule.site_id || null
      });
      toast.success(t('rules.rule_created'));
      setDialogOpen(false);
      setNewRule({
        name: '',
        site_id: '',
        event_types: ['FALL'],
        min_severity: 'HIGH',
        channels: ['in_app'],
        webhook_url: '',
        escalation_minutes: 5,
        escalation_group: '',
        is_active: true
      });
      fetchData();
    } catch (error) {
      toast.error(t('errors.generic'));
    }
  };

  const handleDeleteRule = async (ruleId) => {
    if (!window.confirm('Delete this rule?')) return;
    
    try {
      await rulesAPI.delete(ruleId);
      toast.success(t('rules.rule_deleted'));
      fetchData();
    } catch (error) {
      toast.error(t('errors.generic'));
    }
  };

  const toggleEventType = (type) => {
    setNewRule(prev => ({
      ...prev,
      event_types: prev.event_types.includes(type)
        ? prev.event_types.filter(t => t !== type)
        : [...prev.event_types, type]
    }));
  };

  const toggleChannel = (channel) => {
    setNewRule(prev => ({
      ...prev,
      channels: prev.channels.includes(channel)
        ? prev.channels.filter(c => c !== channel)
        : [...prev.channels, channel]
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div data-testid="rules-page" className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t('rules.title')}</h1>
            <p className="text-muted-foreground">
              {rules.length} {t('rules.title').toLowerCase()}
            </p>
          </div>
        </div>
        
        {canManageRules && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="add-rule-btn">
                <Plus className="h-4 w-4 mr-2" />
                {t('add')} {t('rules.title')}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{t('add')} {t('rules.title')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4 max-h-[70vh] overflow-y-auto">
                <div className="space-y-2">
                  <Label>{t('rules.name')}</Label>
                  <Input
                    value={newRule.name}
                    onChange={(e) => setNewRule(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Alerte Chute Critique"
                    data-testid="rule-name-input"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>{t('events.site')} (optional)</Label>
                  <select
                    className="w-full p-2 rounded-md border border-input bg-background"
                    value={newRule.site_id}
                    onChange={(e) => setNewRule(prev => ({ ...prev, site_id: e.target.value }))}
                    data-testid="rule-site-select"
                  >
                    <option value="">{t('all')} {t('sites.title')}</option>
                    {sites.map(site => (
                      <option key={site.id} value={site.id}>{site.name}</option>
                    ))}
                  </select>
                </div>
                
                <div className="space-y-2">
                  <Label>{t('rules.event_types')}</Label>
                  <div className="flex gap-4">
                    {['FALL', 'PRE_FALL', 'UNKNOWN'].map(type => (
                      <label key={type} className="flex items-center gap-2">
                        <Checkbox
                          checked={newRule.event_types.includes(type)}
                          onCheckedChange={() => toggleEventType(type)}
                          data-testid={`rule-type-${type}`}
                        />
                        <span className="text-sm">{t(`events.type_${type.toLowerCase()}`)}</span>
                      </label>
                    ))}
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label>{t('rules.min_severity')}</Label>
                  <select
                    className="w-full p-2 rounded-md border border-input bg-background"
                    value={newRule.min_severity}
                    onChange={(e) => setNewRule(prev => ({ ...prev, min_severity: e.target.value }))}
                    data-testid="rule-severity-select"
                  >
                    <option value="LOW">{t('events.severity_low')}</option>
                    <option value="MED">{t('events.severity_med')}</option>
                    <option value="HIGH">{t('events.severity_high')}</option>
                  </select>
                </div>
                
                <div className="space-y-2">
                  <Label>{t('rules.channels')}</Label>
                  <div className="flex gap-4">
                    {['in_app', 'email', 'webhook'].map(channel => (
                      <label key={channel} className="flex items-center gap-2">
                        <Checkbox
                          checked={newRule.channels.includes(channel)}
                          onCheckedChange={() => toggleChannel(channel)}
                          data-testid={`rule-channel-${channel}`}
                        />
                        <span className="text-sm">{t(`rules.channel_${channel}`)}</span>
                      </label>
                    ))}
                  </div>
                </div>
                
                {newRule.channels.includes('webhook') && (
                  <div className="space-y-2">
                    <Label>{t('rules.webhook_url')}</Label>
                    <Input
                      value={newRule.webhook_url}
                      onChange={(e) => setNewRule(prev => ({ ...prev, webhook_url: e.target.value }))}
                      placeholder="https://example.com/webhook"
                      data-testid="rule-webhook-input"
                    />
                  </div>
                )}
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t('rules.escalation_minutes')}</Label>
                    <Input
                      type="number"
                      min="1"
                      value={newRule.escalation_minutes}
                      onChange={(e) => setNewRule(prev => ({ ...prev, escalation_minutes: parseInt(e.target.value) || 5 }))}
                      data-testid="rule-escalation-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('rules.escalation_group')}</Label>
                    <Input
                      value={newRule.escalation_group}
                      onChange={(e) => setNewRule(prev => ({ ...prev, escalation_group: e.target.value }))}
                      placeholder="superviseurs"
                      data-testid="rule-group-input"
                    />
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <Switch
                    checked={newRule.is_active}
                    onCheckedChange={(v) => setNewRule(prev => ({ ...prev, is_active: v }))}
                    data-testid="rule-active-switch"
                  />
                  <Label>{t('rules.is_active')}</Label>
                </div>
                
                <Button 
                  className="w-full" 
                  onClick={handleCreateRule}
                  disabled={!newRule.name || newRule.event_types.length === 0}
                  data-testid="create-rule-submit"
                >
                  {t('save')}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Rules List */}
      {rules.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t('rules.no_rules')}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {rules.map((rule) => (
            <Card key={rule.id} data-testid={`rule-card-${rule.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{rule.name}</h3>
                      <Badge variant={rule.is_active ? 'default' : 'secondary'}>
                        {rule.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {rule.event_types?.map(t => t).join(', ')}
                      </span>
                      <span>Min: {rule.min_severity}</span>
                      {rule.site_id ? (
                        <span>Site: {sites.find(s => s.id === rule.site_id)?.name}</span>
                      ) : (
                        <span>{t('all')} Sites</span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {rule.channels?.includes('in_app') && (
                        <Badge variant="outline" className="text-xs">
                          <Bell className="h-3 w-3 mr-1" />
                          In-App
                        </Badge>
                      )}
                      {rule.channels?.includes('email') && (
                        <Badge variant="outline" className="text-xs">
                          <Mail className="h-3 w-3 mr-1" />
                          Email
                        </Badge>
                      )}
                      {rule.channels?.includes('webhook') && (
                        <Badge variant="outline" className="text-xs">
                          <Webhook className="h-3 w-3 mr-1" />
                          Webhook
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs">
                        <Clock className="h-3 w-3 mr-1" />
                        {rule.escalation_minutes}min
                      </Badge>
                    </div>
                  </div>
                  
                  {canManageRules && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteRule(rule.id)}
                      className="text-destructive hover:text-destructive"
                      data-testid={`delete-rule-${rule.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
