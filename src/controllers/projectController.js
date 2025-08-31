// src/controllers/projectController.js
const projectService = require('../services/projectService');
const { sendErrorResponse } = require('../utils/errorUtils');
const financeService = require('../services/financeService'); // ייבוא שירות הכספים


// --- הוספנו את הפונקציה הזו כאן לנוחות ---
const calculateProjectStatus = (tasks) => {
    if (!tasks || tasks.length === 0) {
        return { status: 'מתוכנן', completionPercentage: 0 };
    }

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(task => task.status === 'הושלם').length;
    const stuckTasks = tasks.filter(task => task.status === 'תקוע').length;

    const completionPercentage = Math.round((completedTasks / totalTasks) * 100);

    let status;

    if (stuckTasks > 0) {
        status = 'בסיכון';
    } else if (completionPercentage === 100) {
        status = 'הושלם';
    } else if (completionPercentage === 0 && tasks.every(t => t.status === 'מתוכנן')) {
        status = 'מתוכנן';
    } else {
        status = 'בתהליך';
    }

    return { status, completionPercentage };
};


const getProjects = async (req, res) => {
    try {
        const organizationId = req.organizationId;
        const userId = req.user.userId;
        const userRole = req.user.role;
        const { page, limit, sortBy, sortOrder,isArchived } = req.query;

        const projectsResult = await projectService.getAllProjects(organizationId, userId, userRole, { page: parseInt(page), limit: parseInt(limit), sortBy, sortOrder,isArchived: isArchived === 'true' });
        
        const projectsWithDynamicStatus = projectsResult.data.map(project => {
            const { status, completionPercentage } = calculateProjectStatus(project.tasks);
            return {
                ...project,
                status,
                completionPercentage,
            };
        });
        
        res.status(200).json({
            ...projectsResult,
            data: projectsWithDynamicStatus
        });

    } catch (error) {
        console.error('Error in projectController.getProjects:', error);
        sendErrorResponse(res, 500, 'Failed to retrieve projects.', { details: error.message });
    }
};

const getProjectById = async (req, res) => {
    // ניתן להוסיף כאן לוגיקה לאחזור פרויקט ספציפי
    sendErrorResponse(res, 501, 'Not Implemented'); 
};


const createProject = async (req, res) => {
    try {
        const organizationId = req.organizationId; 
        // 💡 תיקון: פירוק השדות החדשים מהבקשה
        const { title, description, teamLeads, teamIds, startDate, endDate, monthlyBudgets } = req.body;
        console.log('Data sent to createProject service:', { teamLeads });

        if (!title || !Array.isArray(teamLeads)) {
            return sendErrorResponse(res, 400, 'Title and teamLeads array are required.');
        }

        const newProject = await projectService.createProject(organizationId, {
            title,
            description,
            teamLeads,
            teamIds,
            startDate,
            endDate,
            monthlyBudgets
        });
        res.status(201).json(newProject);
    } catch (error) {
        if (error.message.includes('invalid or not members')) {
            return sendErrorResponse(res, 400, error.message);
        }
        sendErrorResponse(res, 500, 'Failed to create project.', { details: error.message });
    }
};

const updateProject = async (req, res) => {
    try {
        const { projectId } = req.params;
        const organizationId = req.organizationId;
        const updateData = req.body;

        // 💡 לוג לבדיקה: הדפסת הנתונים שמגיעים מהקליינט
        console.log('projectController.updateProject - req.body:', req.body);
        console.log('projectController.updateProject - isArchived in req.body:', req.body.isArchived);

        // 💡 תיקון: עדכון המערך כך שיכלול את השדות החדשים, אך לא את isArchived (זה מטופל ב-archiveProject)
        const allowedUpdates = ['title', 'description', 'teamLeads', 'teamIds', 'startDate', 'endDate', 'status', 'monthlyBudgets'];
        const filteredUpdateData = Object.keys(updateData)
            .filter(key => allowedUpdates.includes(key))
            .reduce((obj, key) => {
                obj[key] = updateData[key];
                return obj;
            }, {});

        // 💡 לוג לבדיקה: הדפסת הנתונים המסוננים
        console.log('projectController.updateProject - filteredUpdateData:', filteredUpdateData);
        console.log('projectController.updateProject - isArchived in filteredUpdateData:', filteredUpdateData.isArchived);

        if (Object.keys(filteredUpdateData).length === 0) {
            return sendErrorResponse(res, 400, 'No valid fields provided for update.');
        }

        const updatedProject = await projectService.updateProject(projectId, organizationId, filteredUpdateData);
        res.status(200).json(updatedProject);
    } catch (error) {
        if (error.message.includes('Project not found')) {
            return sendErrorResponse(res, 404, error.message);
        }
        if (error.message.includes('invalid or not members')) {
            return sendErrorResponse(res, 400, error.message);
        }
        sendErrorResponse(res, 500, 'Failed to update project.', { details: error.message });
    }
};

const archiveProject = async (req, res) => {
    try {
        const { projectId } = req.params;
        const organizationId = req.organizationId;
        const { isArchived } = req.body;

        if (typeof isArchived !== 'boolean') {
            return sendErrorResponse(res, 400, 'Invalid value for isArchived. Must be a boolean.');
        }

        const updatedProject = await projectService.archiveProject(projectId, organizationId, isArchived);
        res.status(200).json(updatedProject);
    } catch (error) {
        if (error.message.includes('Project not found')) {
            return sendErrorResponse(res, 404, error.message);
        }
        sendErrorResponse(res, 500, 'Failed to update project archive status.', { details: error.message });
    }
};


const resetProjectFinances = async (req, res) => {
    try {
        const { projectId } = req.params;
        const organizationId = req.organizationId;
        
        // קריאה לשירות הכספים כדי לבצע את איפוס הכספים
        await financeService.resetProjectFinances(organizationId, projectId);
        
        res.status(204).send(); // החזרת תשובה ריקה כסימן להצלחה (No Content)
    } catch (error) {
        console.error('Error in projectController.resetProjectFinances:', error);
        // טיפול בשגיאות מהשירות, למשל אם הפרויקט לא נמצא
        if (error.message.includes('Project not found')) {
            return sendErrorResponse(res, 404, error.message);
        }
        sendErrorResponse(res, 500, 'Failed to reset project finances.', { details: error.message });
    }
};

const deleteProject = async (req, res) => {
    try {
        const { projectId } = req.params;
        const organizationId = req.organizationId;
        await projectService.deleteProject(projectId, organizationId);
        res.status(204).send();
    } catch (error) {
        if (error.message.includes('Project not found')) {
            return sendErrorResponse(res, 404, error.message);
        }
        sendErrorResponse(res, 500, 'Failed to delete project.', { details: error.message });
    }
};

module.exports = {
    getProjects,
    createProject,
    updateProject,
    archiveProject,
    deleteProject,
    getProjectById,
    resetProjectFinances 
};