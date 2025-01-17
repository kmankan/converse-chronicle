import { PrismaClient } from '@prisma/client';
import { CreateRequest, GetRequest, ListRequest, DeleteRequest, UpdateRequest } from "./model";
import { downloadFile, generatePresignedUrl, uploadBuffer } from './apis/supabase';
import { v4 as uuid } from 'uuid';
import { BUCKET_NAME, FILE_EXTENSION } from './constant';
import { transcribeFile } from './apis/transcribe';
import { getAudioDurationInSeconds } from 'get-audio-duration';
import { tmpdir } from 'os';
import { join } from 'path';

const prisma = new PrismaClient();

export const createRecording = async(req: CreateRequest) => {
    const {userId, recordingBody} = req;
    
    // Get audio duration from buffer using system temp directory
    const tempFilePath = join(tmpdir(), `${uuid()}${FILE_EXTENSION}`);
    await require('fs').promises.writeFile(tempFilePath, recordingBody);
    const durationInSeconds = Math.round(await getAudioDurationInSeconds(tempFilePath));
    console.log(`durationInSeconds: `, durationInSeconds);
    await require('fs').promises.unlink(tempFilePath); // Clean up temp file
    
    // Get the full conversation object with speaker information
    // const {conversation, summary, title} = await transcribeSpeechmatics(recordingBody!);
    // // Instead of joining messages directly, format them with speaker information
    // const transcript = conversation.map(item => 
    //     `${item.speaker}:\n${item.message}\n`
    // ).join("\n");
    
    const {transcript,
        title,
        shortSummary,
        allTopics,
        allIntents,
        allUtterances} = await transcribeFile(recordingBody!)

    console.log(`file transcribed successfully`);
    // upload audio to supabase storage
    const recordingId = uuid();
    const filePath = `${userId}/${recordingId}` + FILE_EXTENSION;
    await uploadBuffer(BUCKET_NAME, filePath, recordingBody, "audio/x-m4a");
    
    // save record to db
    const newRecording = await prisma.conversation.create({
        data: {
            title: title ?? `conversation_${new Date().toLocaleDateString()}`,
            userId: userId,
            recording_url: "", // todo: add recording url
            file_path: filePath, 
            transcript: transcript,
            summary: shortSummary ?? "",
            topics: allTopics ? {
                create: allTopics!.map(topic => ({
                    topic: topic
                }))
            } : {},
            utterances: allUtterances ? {
                create: allUtterances!.map(utterance => ({
                    speaker: utterance.speaker,
                    transcript: utterance.transcript,
                    start: utterance.start,
                    end: utterance.end
                }))
            } : {},
            duration: durationInSeconds
        }
    });
    console.log(`Created recording in db successfully`);
    return {
        ...newRecording,
        filePath,
        transcript,
        summary: shortSummary ?? "",
    };
};

export const getRecording = async(req: GetRequest) => {
    const {recordingId} = req;
    const id = recordingId;
    
    const conversation = await prisma.conversation.findUnique({
        where: { id: id },
        include: { topics: true, utterances: true }
    });
    if (conversation) {
        const file_path = conversation?.file_path;
        //const recordingBlob = await downloadFile(BUCKET_NAME, file_path);
        const recordingUrl = await generatePresignedUrl(BUCKET_NAME, file_path);
        return {
            ...conversation,
            recordingUrl: recordingUrl
        }
    }
    return conversation;
}

export const listRecordings = async(req: ListRequest) => {
    const { userId } = req;

    const conversationsInfo = await prisma.conversation.findMany({
        where: { userId: userId },
        select: {
            id: true,
            title: true,
            topics: true,
            createdAt: true,
            updatedAt: true,
            duration: true
        }
    });
    return conversationsInfo;
}

export const deleteRecording = async(req: DeleteRequest) => {
    const { recordingId} = req;
    // todo: delete file in storage as well
    const result = await prisma.conversation.delete({
        where: { id: recordingId},
    });
    console.log(result);
    return result;
}


export const updateRecording = async(req: UpdateRequest) => {
    const {recordingId, title, transcript} = req;
    const result = await prisma.conversation.update({
        where: { id: recordingId},
        data: {
            title: title,
            transcript: transcript
        },
    });
    console.log(result);
    return result;
}
