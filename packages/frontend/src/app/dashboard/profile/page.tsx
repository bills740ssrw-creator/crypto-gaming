'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { User, Lock, Shield, Save, AlertCircle, CheckCircle } from 'lucide-react';
import { authApi } from '@/lib/api';
import { useUserStore } from '@/store';
import toast from 'react-hot-toast';

const profileSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').max(30, 'Username must be at most 30 characters').regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores').optional(),
  email: z.string().email('Invalid email address').optional(),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters').max(128, 'New password must be at most 128 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

type ProfileForm = z.infer<typeof profileSchema>;
type PasswordForm = z.infer<typeof passwordSchema>;

export default function ProfilePage() {
  const { username, email, isAdmin, kycVerified, kycLevel, setUser } = useUserStore();
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'kyc'>('profile');
  const [loading, setLoading] = useState(false);

  const profileForm = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { username: username ?? undefined, email: email ?? undefined },
  });

  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
  });

  const onProfileSubmit = async (data: ProfileForm) => {
    setLoading(true);
    try {
      const res = await authApi.updateProfile(data);
      if (res.data.success) {
        setUser(res.data.data);
        toast.success('Profile updated successfully');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const onPasswordSubmit = async (data: PasswordForm) => {
    setLoading(true);
    try {
      await authApi.changePassword(data.currentPassword, data.newPassword);
      toast.success('Password changed successfully');
      passwordForm.reset();
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  const kycLevels = [
    { level: 0, name: 'Unverified', limits: { deposit: '$100', withdrawal: '$0' } },
    { level: 1, name: 'Basic', limits: { deposit: '$1,000', withdrawal: '$500' } },
    { level: 2, name: 'Verified', limits: { deposit: '$10,000', withdrawal: '$5,000' } },
    { level: 3, name: 'Enhanced', limits: { deposit: '$100,000', withdrawal: '$50,000' } },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Profile</h1>
          <p className="text-muted-foreground mt-1">Manage your account settings</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={kycVerified ? 'success' : 'warning'}>{kycLevels[kycLevel].name}</Badge>
          {isAdmin && <Badge variant="gold">Admin</Badge>}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="profile">
            <User className="w-4 h-4 mr-2" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="security">
            <Lock className="w-4 h-4 mr-2" />
            Security
          </TabsTrigger>
          <TabsTrigger value="kyc">
            <Shield className="w-4 h-4 mr-2" />
            KYC Verification
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Account Information</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Username</label>
                    <Input
                      {...profileForm.register('username')}
                      placeholder="username"
                    />
                    {profileForm.formState.errors.username && (
                      <p className="mt-1 text-sm text-destructive flex items-center gap-1">
                        <AlertCircle className="w-4 h-4" />
                        {profileForm.formState.errors.username.message}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Email</label>
                    <Input
                      {...profileForm.register('email')}
                      type="email"
                      placeholder="you@example.com"
                    />
                    {profileForm.formState.errors.email && (
                      <p className="mt-1 text-sm text-destructive flex items-center gap-1">
                        <AlertCircle className="w-4 h-4" />
                        {profileForm.formState.errors.email.message}
                      </p>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Region</label>
                  <select className="w-full px-3 py-2.5 rounded-lg border border-input bg-card text-foreground" disabled>
                    <option value="US">US Sweepstakes (Gold & Sweeps Coins)</option>
                    <option value="GLOBAL">Global Crypto (BTC, ETH, USDT, etc.)</option>
                  </select>
                  <p className="mt-1 text-sm text-muted-foreground">Region cannot be changed after registration</p>
                </div>
                <Button type="submit" className="w-full md:w-auto" loading={loading}>
                  <Save className="w-4 h-4 mr-2" />
                  Save Changes
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Change Password</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4 max-w-md">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Current Password</label>
                  <Input
                    {...passwordForm.register('currentPassword')}
                    type="password"
                    placeholder="Enter current password"
                  />
                  {passwordForm.formState.errors.currentPassword && (
                    <p className="mt-1 text-sm text-destructive">{passwordForm.formState.errors.currentPassword.message}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">New Password</label>
                  <Input
                    {...passwordForm.register('newPassword')}
                    type="password"
                    placeholder="Enter new password"
                  />
                  {passwordForm.formState.errors.newPassword && (
                    <p className="mt-1 text-sm text-destructive">{passwordForm.formState.errors.newPassword.message}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Confirm New Password</label>
                  <Input
                    {...passwordForm.register('confirmPassword')}
                    type="password"
                    placeholder="Confirm new password"
                  />
                  {passwordForm.formState.errors.confirmPassword && (
                    <p className="mt-1 text-sm text-destructive">{passwordForm.formState.errors.confirmPassword.message}</p>
                  )}
                </div>
                <Button type="submit" className="w-full md:w-auto" loading={loading}>
                  <Save className="w-4 h-4 mr-2" />
                  Update Password
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="text-destructive flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                Danger Zone
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Once you delete your account, there is no going back. Please be certain.
              </p>
              <Button variant="destructive" onClick={() => { if (confirm('Are you sure you want to delete your account? This action cannot be undone.')) { alert('Account deletion would be implemented here'); } }}>
                Delete Account
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="kyc" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>KYC Verification</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {kycLevels.map((level) => (
                  <div key={level.level} className={cn(
                    'p-4 rounded-lg border transition-colors',
                    kycLevel === level.level
                      ? 'border-primary bg-primary/10'
                      : 'border-border'
                  )}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          'w-10 h-10 rounded-full flex items-center justify-center',
                          kycLevel >= level.level ? 'bg-primary/15' : 'bg-secondary'
                        )}>
                          {kycLevel >= level.level ? (
                            <CheckCircle className="w-5 h-5 text-primary" />
                          ) : (
                            <span className="text-muted-foreground font-bold">{level.level}</span>
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{level.name} Verification</p>
                          <p className="text-sm text-muted-foreground">
                            Deposit limit: {level.limits.deposit} · Withdrawal limit: {level.limits.withdrawal}
                          </p>
                        </div>
                      </div>
                      {kycLevel < level.level && kycLevel === level.level - 1 && (
                        <Button variant="outline" size="sm" onClick={() => toast.success('KYC submission would be implemented here')}>
                          Verify Now
                        </Button>
                      )}
                      {kycLevel >= level.level && (
                        <Badge variant="success" size="sm">Verified</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}