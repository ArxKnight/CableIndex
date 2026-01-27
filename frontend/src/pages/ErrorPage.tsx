import React from 'react';
import { Link, useRouteError } from 'react-router-dom';
import { AlertTriangle, Home, RefreshCw } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';

interface RouteError {
  statusText?: string;
  message?: string;
  status?: number;
}

const ErrorPage: React.FC = () => {
  const error = useRouteError() as RouteError;

  const getErrorMessage = () => {
    if (error?.status === 404) {
      return 'The page you\'re looking for doesn\'t exist.';
    }
    if (error?.statusText) {
      return error.statusText;
    }
    if (error?.message) {
      return error.message;
    }
    return 'An unexpected error occurred.';
  };

  const getErrorTitle = () => {
    if (error?.status === 404) {
      return 'Page Not Found';
    }
    if (error?.status) {
      return `Error ${error.status}`;
    }
    return 'Something went wrong';
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="w-8 h-8 text-red-600" />
          </div>
          <CardTitle className="text-2xl">{getErrorTitle()}</CardTitle>
          <CardDescription>
            {getErrorMessage()}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(import.meta as any).env?.DEV && error && (
            <div className="p-3 bg-gray-100 rounded-md text-left">
              <pre className="text-sm text-gray-700 whitespace-pre-wrap">
                {JSON.stringify(error, null, 2)}
              </pre>
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-2">
            <Button 
              onClick={() => window.location.reload()} 
              variant="outline" 
              className="flex-1"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            <Link to="/dashboard" className="flex-1">
              <Button className="w-full flex items-center justify-center">
                <Home className="w-4 h-4 mr-2" />
                Dashboard
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ErrorPage;