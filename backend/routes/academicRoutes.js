import { Router } from 'express';
import { AcademicController } from '../controllers/academicController.js';
import { optionalAuthenticate, authenticate } from '../middleware/authMiddleware.js';
import { requireRole } from '../middleware/roleMiddleware.js';

export const classesRouter = Router();
classesRouter.get('/', optionalAuthenticate, AcademicController.getClasses);
classesRouter.get('/:id', optionalAuthenticate, AcademicController.getClassById);
classesRouter.post('/', authenticate, requireRole('ADMIN', 'FACULTY'), AcademicController.createClass);

export const departmentsRouter = Router();
departmentsRouter.get('/', optionalAuthenticate, AcademicController.getDepartments);
departmentsRouter.get('/:id', optionalAuthenticate, AcademicController.getDepartmentById);
departmentsRouter.post('/', authenticate, requireRole('ADMIN'), AcademicController.createDepartment);

export const institutionsRouter = Router();
institutionsRouter.get('/', optionalAuthenticate, AcademicController.getInstitutions);
institutionsRouter.get('/:id', optionalAuthenticate, AcademicController.getInstitutionById);

