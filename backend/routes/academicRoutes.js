import { Router } from 'express';
import { AcademicController } from '../controllers/academicController.js';
import { optionalAuthenticate, authenticate } from '../middleware/authMiddleware.js';
import { requireRole } from '../middleware/roleMiddleware.js';

export const classesRouter = Router();
classesRouter.get('/', optionalAuthenticate, AcademicController.getClasses);
classesRouter.get('/:id', optionalAuthenticate, AcademicController.getClassById);
classesRouter.post('/', optionalAuthenticate, AcademicController.createClass);
classesRouter.put('/:id', optionalAuthenticate, AcademicController.updateClass);
classesRouter.delete('/:id', optionalAuthenticate, AcademicController.deleteClass);

export const departmentsRouter = Router();
departmentsRouter.get('/', optionalAuthenticate, AcademicController.getDepartments);
departmentsRouter.get('/:id', optionalAuthenticate, AcademicController.getDepartmentById);
departmentsRouter.post('/', optionalAuthenticate, AcademicController.createDepartment);
departmentsRouter.put('/:id', optionalAuthenticate, AcademicController.updateDepartment);
departmentsRouter.delete('/:id', optionalAuthenticate, AcademicController.deleteDepartment);

export const institutionsRouter = Router();
institutionsRouter.get('/', optionalAuthenticate, AcademicController.getInstitutions);
institutionsRouter.get('/:id', optionalAuthenticate, AcademicController.getInstitutionById);
institutionsRouter.put('/:id', optionalAuthenticate, AcademicController.updateInstitution);
institutionsRouter.delete('/:id', optionalAuthenticate, AcademicController.deleteInstitution);

