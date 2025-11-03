# MVC Architecture Implementation

This project now follows the Model-View-Controller (MVC) architectural pattern for better code organization and maintainability.

## Directory Structure

```
src/
├── app.js                 # Main application setup
├── index.js              # Server entry point
├── config/
│   └── database.js       # Database configuration
├── controllers/
│   └── SiteController.js # Request handling logic
├── models/
│   └── Site.js           # Data layer and business logic
├── routes/
│   └── siteRoutes.js     # Route definitions
├── services/
│   └── SiteService.js    # Business logic layer
├── cleanup.js            # Utility functions
└── docker.js             # Docker integration
```

## Architecture Components

### Models (`/models`)
- **Site.js**: Handles data operations and database interactions
- Manages Docker containers and MySQL database operations
- Contains static methods for CRUD operations

### Views (`/views`)
- **index.ejs**: Main UI template
- Uses EJS templating engine
- Separated CSS into external stylesheet

### Controllers (`/controllers`)
- **SiteController.js**: Handles HTTP requests and responses
- Coordinates between services and models
- Manages error handling and response formatting

### Services (`/services`)
- **SiteService.js**: Contains business logic
- Abstracts complex operations from controllers
- Handles data transformation and validation

### Routes (`/routes`)
- **siteRoutes.js**: Defines application endpoints
- Maps URLs to controller methods
- Centralizes route management

### Config (`/config`)
- **database.js**: Database connection configuration
- Environment variable management
- Reusable database pool

## Benefits of MVC Implementation

1. **Separation of Concerns**: Each layer has a specific responsibility
2. **Maintainability**: Easier to modify and extend functionality
3. **Testability**: Components can be tested independently
4. **Reusability**: Services and models can be reused across controllers
5. **Scalability**: Easy to add new features and endpoints

## API Endpoints

- `GET /` - Render main UI page
- `GET /sites` - Get all active demo sites
- `POST /create-site` - Create a new demo site
- `POST /cleanup` - Trigger manual cleanup

## Usage

The refactored code maintains the same functionality while providing better structure:

```javascript
// Before: Everything in index.js
app.get('/sites', async (req, res) => { /* inline logic */ });

// After: Organized MVC structure
// Route -> Controller -> Service -> Model
router.get('/sites', SiteController.getAllSites);
```