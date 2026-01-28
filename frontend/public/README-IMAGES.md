# WireIndex Image Assets

## Image Files to Replace

The following placeholder files need to be replaced with the actual WireIndex logo images:

### 1. cableindex-logo.png
- **Usage**: Full logo with database icon and text for login/register pages
- **Recommended size**: 256x64px or similar aspect ratio
- **Format**: PNG with transparent background
- **Current**: Placeholder text file

### 2. cableindex-title.png  
- **Usage**: Text-only logo for headers and titles
- **Recommended size**: 400x80px or similar aspect ratio
- **Format**: PNG with transparent background
- **Current**: Placeholder text file

### 3. cableindex-icon.png
- **Usage**: Icon only (database with cables) for navigation and favicon
- **Recommended size**: 64x64px square
- **Format**: PNG with transparent background
- **Current**: Placeholder text file

### 4. favicon.ico
- **Usage**: Browser favicon
- **Recommended size**: 32x32px or 16x16px
- **Format**: ICO format
- **Current**: Placeholder text file

## How to Replace

1. Save your actual image files with the same names
2. Replace the placeholder files in `frontend/public/`
3. Ensure the images have transparent backgrounds where appropriate
4. Test the application to verify images display correctly

## Image Locations in Code

- **Navigation**: `frontend/src/components/layout/Navigation.tsx` (uses cableindex-icon.png)
- **Login Form**: `frontend/src/components/auth/LoginForm.tsx` (uses cableindex-logo.png)  
- **Register Form**: `frontend/src/components/auth/RegisterForm.tsx` (uses cableindex-logo.png)
- **HTML Head**: `frontend/index.html` (uses cableindex-icon.png and favicon.ico)