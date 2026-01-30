import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckCircle, Database, User, Settings, AlertCircle, Loader2 } from 'lucide-react';

const setupSchema = z.object({
  database: z.object({
    type: z.enum(['sqlite', 'mysql']),
    sqlite: z.object({
      filename: z.string().optional(),
    }).optional(),
    mysql: z.object({
      host: z.string().min(1, 'Host is required'),
      port: z.number().min(1).max(65535),
      user: z.string().min(1, 'Username is required'),
      password: z.string(),
      database: z.string().min(1, 'Database name is required'),
      ssl: z.boolean().optional(),
    }).optional(),
  }),
  admin: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    fullName: z.string().min(1, 'Full name is required'),
  }),
});

type SetupFormData = z.infer<typeof setupSchema>;

const SetupPage: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [connectionError, setConnectionError] = useState<string>('');
  const [setupComplete, setSetupComplete] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
    trigger,
  } = useForm<SetupFormData>({
    resolver: zodResolver(setupSchema),
    defaultValues: {
      database: {
        type: 'sqlite',
        sqlite: {
          filename: '/app/data/cableindex.db',
        },
        mysql: {
          host: 'localhost',
          port: 3306,
          user: 'root',
          password: '',
          database: 'cableindex',
          ssl: false,
        },
      },
      admin: {
        email: '',
        password: '',
        fullName: '',
      },
    },
  });

  const databaseType = watch('database.type');

  // Test database connection
  const testConnection = async () => {
    setConnectionStatus('testing');
    setConnectionError('');

    try {
      const isValid = await trigger('database');
      if (!isValid) {
        setConnectionStatus('error');
        setConnectionError('Please fix validation errors first');
        return;
      }

      const formData = watch();
      const response = await fetch('/api/setup/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ database: formData.database }),
      });

      const result = await response.json();

      if (result.success && result.connected) {
        setConnectionStatus('success');
      } else {
        setConnectionStatus('error');
        setConnectionError(result.error || 'Connection failed');
      }
    } catch (error) {
      setConnectionStatus('error');
      setConnectionError('Failed to test connection');
    }
  };

  // Complete setup
  const onSubmit = async (data: SetupFormData) => {
    setIsLoading(true);

    try {
      const response = await fetch('/api/setup/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (result.success) {
        setSetupComplete(true);
        // Redirect to login after a delay
        setTimeout(() => {
          window.location.href = '/auth/login';
        }, 3000);
      } else {
        throw new Error(result.error || 'Setup failed');
      }
    } catch (error) {
      console.error('Setup error:', error);
      alert(error instanceof Error ? error.message : 'Setup failed');
    } finally {
      setIsLoading(false);
    }
  };

  const nextStep = async () => {
    if (currentStep === 1) {
      const isValid = await trigger('database');
      if (isValid && connectionStatus === 'success') {
        setCurrentStep(2);
      }
    } else if (currentStep === 2) {
      const isValid = await trigger('admin');
      if (isValid) {
        setCurrentStep(3);
      }
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  if (setupComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <CardTitle>Setup Complete!</CardTitle>
            <CardDescription>
              CableIndex has been configured successfully. You'll be redirected to the login page shortly.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-6 h-6" />
            CableIndex Setup
          </CardTitle>
          <CardDescription>
            Welcome! Let's configure your CableIndex installation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={currentStep.toString()} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="1" disabled={currentStep < 1}>
                <Database className="w-4 h-4 mr-2" />
                Database
              </TabsTrigger>
              <TabsTrigger value="2" disabled={currentStep < 2}>
                <User className="w-4 h-4 mr-2" />
                Admin User
              </TabsTrigger>
              <TabsTrigger value="3" disabled={currentStep < 3}>
                <CheckCircle className="w-4 h-4 mr-2" />
                Review
              </TabsTrigger>
            </TabsList>

            <form onSubmit={handleSubmit(onSubmit)}>
              <TabsContent value="1" className="space-y-4">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="database-type">Database Type</Label>
                    <Select
                      value={databaseType}
                      onValueChange={(value) => setValue('database.type', value as 'sqlite' | 'mysql')}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sqlite">SQLite (Recommended)</SelectItem>
                        <SelectItem value="mysql">MySQL</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {databaseType === 'sqlite' && (
                    <div>
                      <Label htmlFor="sqlite-filename">Database File Path</Label>
                      <Input
                        id="sqlite-filename"
                        {...register('database.sqlite.filename')}
                        placeholder="/app/data/cableindex.db"
                      />
                      <p className="text-sm text-gray-500 mt-1">
                        Path where the SQLite database file will be stored
                      </p>
                    </div>
                  )}

                  {databaseType === 'mysql' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="mysql-host">Host</Label>
                          <Input
                            id="mysql-host"
                            {...register('database.mysql.host')}
                            placeholder="localhost"
                          />
                          {errors.database?.mysql?.host && (
                            <p className="text-sm text-red-600">{errors.database.mysql.host.message}</p>
                          )}
                        </div>
                        <div>
                          <Label htmlFor="mysql-port">Port</Label>
                          <Input
                            id="mysql-port"
                            type="number"
                            {...register('database.mysql.port', { valueAsNumber: true })}
                            placeholder="3306"
                          />
                          {errors.database?.mysql?.port && (
                            <p className="text-sm text-red-600">{errors.database.mysql.port.message}</p>
                          )}
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="mysql-database">Database Name</Label>
                        <Input
                          id="mysql-database"
                          {...register('database.mysql.database')}
                          placeholder="cableindex"
                        />
                        {errors.database?.mysql?.database && (
                          <p className="text-sm text-red-600">{errors.database.mysql.database.message}</p>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="mysql-user">Username</Label>
                          <Input
                            id="mysql-user"
                            {...register('database.mysql.user')}
                            placeholder="root"
                          />
                          {errors.database?.mysql?.user && (
                            <p className="text-sm text-red-600">{errors.database.mysql.user.message}</p>
                          )}
                        </div>
                        <div>
                          <Label htmlFor="mysql-password">Password</Label>
                          <Input
                            id="mysql-password"
                            type="password"
                            {...register('database.mysql.password')}
                            placeholder="Password"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button type="button" onClick={testConnection} disabled={connectionStatus === 'testing'}>
                      {connectionStatus === 'testing' && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Test Connection
                    </Button>
                    {connectionStatus === 'success' && (
                      <div className="flex items-center text-green-600">
                        <CheckCircle className="w-4 h-4 mr-1" />
                        Connected
                      </div>
                    )}
                  </div>

                  {connectionStatus === 'error' && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{connectionError}</AlertDescription>
                    </Alert>
                  )}
                </div>

                <div className="flex justify-end">
                  <Button
                    type="button"
                    onClick={nextStep}
                    disabled={connectionStatus !== 'success'}
                  >
                    Next
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="2" className="space-y-4">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="admin-email">Global Admin Email</Label>
                    <Input
                      id="admin-email"
                      type="email"
                      {...register('admin.email')}
                      placeholder="admin@example.com"
                    />
                    {errors.admin?.email && (
                      <p className="text-sm text-red-600">{errors.admin.email.message}</p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="admin-fullName">Global Admin Full Name</Label>
                    <Input
                      id="admin-fullName"
                      {...register('admin.fullName')}
                      placeholder="Administrator"
                    />
                    {errors.admin?.fullName && (
                      <p className="text-sm text-red-600">{errors.admin.fullName.message}</p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="admin-password">Global Admin Password</Label>
                    <Input
                      id="admin-password"
                      type="password"
                      {...register('admin.password')}
                      placeholder="Minimum 8 characters"
                    />
                    {errors.admin?.password && (
                      <p className="text-sm text-red-600">{errors.admin.password.message}</p>
                    )}
                  </div>
                </div>

                <div className="flex justify-between">
                  <Button type="button" variant="outline" onClick={prevStep}>
                    Previous
                  </Button>
                  <Button type="button" onClick={nextStep}>
                    Next
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="3" className="space-y-4">
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Review Configuration</h3>
                  
                  <div className="space-y-2">
                    <h4 className="font-medium">Database</h4>
                    <p className="text-sm text-gray-600">
                      Type: {databaseType.toUpperCase()}
                      {databaseType === 'mysql' && (
                        <>
                          <br />Host: {watch('database.mysql.host')}:{watch('database.mysql.port')}
                          <br />Database: {watch('database.mysql.database')}
                        </>
                      )}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-medium">Global Admin User</h4>
                    <p className="text-sm text-gray-600">
                      Email: {watch('admin.email')}
                      <br />Name: {watch('admin.fullName')}
                    </p>
                  </div>
                </div>

                <div className="flex justify-between">
                  <Button type="button" variant="outline" onClick={prevStep}>
                    Previous
                  </Button>
                  <Button type="submit" disabled={isLoading}>
                    {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Complete Setup
                  </Button>
                </div>
              </TabsContent>
            </form>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default SetupPage;